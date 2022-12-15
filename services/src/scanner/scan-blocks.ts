import * as Gql from 'ar-gql'
import { GQLEdgeInterface } from 'ar-gql/dist/faces'
import { TxScanned } from '../common/shepherd-plugin-interfaces/types'
import getDbConnection from '../common/utils/db-connection'
import { logger } from '../common/shepherd-plugin-interfaces/logger'
import { performance } from 'perf_hooks'
import { slackLogger } from '../common/utils/slackLogger'
import memoize from 'micro-memoize'


const knex = getDbConnection()



export const scanBlocks = async (minBlock: number, maxBlock: number, gqlUrl: string) => {

	try{

		/* get images and videos */

		logger(gqlUrl, `making 1 scans of ${((maxBlock - minBlock) + 1)} blocks, from block ${minBlock} to ${maxBlock}`)
		return await getRecords(minBlock, maxBlock, gqlUrl)

	}catch(e:any){

		let status = Number(e.response?.status) || 0

		if( status >= 500 ){
			logger(gqlUrl, 'GATEWAY ERROR!', e.message, 'Waiting for 30 seconds...')
			throw e
		}else{
			logger(gqlUrl, 'Error!', e.name, ':', e.message)
			logger(e)
			logger("Error in scanBlocks. See above.")
			throw e 
		}
	}
}

/* our specialised queries */

const queryGoldskyWild = `query($cursor: String, $minBlock: Int, $maxBlock: Int) {
	transactions(
		block: {
			min: $minBlock,
			max: $maxBlock,
		}
		tags: [
			{ name: "Content-Type", values: ["video/*", "image/*"], match: WILDCARD}
		]
		first: 100
		after: $cursor
	) {
		pageInfo {
			hasNextPage
		}
		edges {
			cursor
			node{
				id
				data{
					size
					type
				}
				tags{ 
					name 
					value
				}
				block{
					height
				}
				parent{
					id
				}
			}
		}
	}
}`

const queryArio = `query($cursor: String, $minBlock: Int, $maxBlock: Int) {
	transactions(
		block: {
			min: $minBlock,
			max: $maxBlock,
		}
		tags: [
			{ name: "Content-Type", values: [
				"image/bmp",
				"image/jpeg",
				"image/jpg",
				"image/png",
				"image/gif",
				"image/tiff",
				"image/webp",
				"image/x-ms-bmp",
				"image/svg+xml",
				"image/apng",
				"image/heic",
				"video/3gpp",
				"video/3gpp2",
				"video/mp2t",
				"video/mp4",
				"video/mpeg",
				"video/ogg",
				"video/quicktime",
				"video/webm",
				"video/x-flv",
				"video/x-m4v",
				"video/x-msvideo",
				"video/x-ms-wmv",
			] }
		]
		first: 100
		after: $cursor
	) {
		pageInfo {
			hasNextPage
		}
		edges {
			cursor
			node{
				id
				data{
					size
					type
				}
				tags{ 
					name 
					value
				}
				block{
					height
				}
				parent{
					id
				}
			}
		}
	}
}`



/* Generic getRecords */

const getRecords = async (minBlock: number, maxBlock: number, gqlUrl: string) => {
	const query = (gqlUrl.includes('goldsky')) ? queryGoldskyWild : queryArio
	let hasNextPage = true
	let cursor = ''
	let numRecords = 0 

	while(hasNextPage){
		const t0 = performance.now()
		let res; 
		while(true){
			try{
				res = (await Gql.run(
					query, 
					{ 
						minBlock,
						maxBlock,
						cursor,
					},
					gqlUrl,
				)).data.transactions
				break;
			}catch(e:any){
				if(e instanceof TypeError){
					logger(gqlUrl, 'gql-error', 'data: null. errors in res.data.errors')
					continue;
				}
				if(e.code && e.code === 'ECONNRESET'){
					logger(gqlUrl, 'gql-error', 'ECONNRESET')
					continue;
				}
				// if(e.response?.status === 504){
				// 	logger('gql-error', e.response?.status, ':', e.message)
				// 	continue;
				// }
				logger(gqlUrl, 'gql-error', e.response?.status, ':', e.message)
				throw e;
			}
		}
		let edges = res.edges
		if(edges && edges.length){
			cursor = edges[edges.length - 1].cursor

			/* filter dupes from edges. batch insert does not like dupes */
			edges = [...new Map(edges.map(edge => [edge.node.id, edge])).values()]

			numRecords += await insertRecords(edges, gqlUrl)
		}
		hasNextPage = res.pageInfo.hasNextPage

		const tProcess = performance.now() - t0
		logger('info', `processed gql page of ${edges.length} results in ${tProcess.toFixed(0)} ms. cursor: ${cursor}. Total ${numRecords} records.`)
	}

	return numRecords
}

const getParent = memoize(
	async(p: string, gqlUrl: string)=> {
		const res = await Gql.tx(p, gqlUrl)
		console.log({p, res})
		return res.parent?.id || null
	},
	{ maxSize: 10000},
)

const insertRecords = async(metas: GQLEdgeInterface[], gqlUrl: string)=> {

	// metas.map(meta => console.log(meta.node))

	let records: TxScanned[] = []

	for (const item of metas) {
		const txid = item.node.id
		let content_type = item.node.data.type
		const content_size = item.node.data.size.toString()
		const height = item.node.block.height
		const parent = item.node.parent?.id || null // the direct parent, if exists
		const parents: string[] = []

		// sanity
		if(!height){
			logger(`HeightError` , `no height for '${txid}'`)
			slackLogger(`HeightError : no height for '${txid}'`)
		}

		// this content_type is missing for dataItems
		if(!content_type){ 
			for(const tag of item.node.tags){
				if(tag.name === 'Content-Type'){
					content_type = tag.value
					break;
				}
			}
		}

		// loop to find all nested parents
		if(parent){
			let p: string | null = parent
			do{
				p = await getParent(p, gqlUrl)
			}while(p && parents.push(p))
		}

		records.push({
			txid, 
			content_type,
			content_size,
			height,
			parent,
			...(parents.length > 0 && {parents}), //leave `parents` null if not nested
		})
	}

	try{
		await knex<TxScanned>('txs').insert(records).onConflict('txid').merge(['height', 'parent', 'parents'])
	}	catch(e:any){
		if(e.code && Number(e.code) === 23502){
			logger('Error!', 'Null value in column violates not-null constraint', e.detail)
			slackLogger('Error!', 'Null value in column violates not-null constraint', e.detail)
			throw e
		} else { 
			if(e.code) logger('Error!', e.code)
			throw e
		}
	}

	return records.length
}