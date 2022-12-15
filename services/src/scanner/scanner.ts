require('dotenv').config() //first line of entrypoint
import si from 'systeminformation'
import { performance } from 'perf_hooks'
import { scanBlocks } from "./scan-blocks"
import dbConnection from "../common/utils/db-connection"
import { getGqlHeight } from '../common/utils/gql-height'
import { StateRecord } from "../common/shepherd-plugin-interfaces/types"
import { logger } from "../common/shepherd-plugin-interfaces/logger"
import { slackLogger } from "../common/utils/slackLogger"


//leave some space from weave head (trail behind) to avoid orphan forks and allow tx data to be uploaded
const TRAIL_BEHIND = 15 


const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const waitForNewBlock =  async (height: number, gqlUrl: string) => {
	while(true){
		let h = await getGqlHeight(gqlUrl)
		if(h >= height){
			return h; //stop waiting
		}
		logger(gqlUrl, 'weave height', h, 'synced to height', (h - TRAIL_BEHIND))
		await sleep(30000)
	}
}

export const scanner = async(gqlUrl: string)=> {
	try {
		/**
		 * numOfBlocks - to scan at once
		 * very rough guide:
		 * early weave this should be high: ~1000
		 * mid weave about 100?
		 * above ~350,000 <=> 657796: 50 appears ~optimal
		 * keep pace once at the top: 1
		 */
		const db = dbConnection()
		let pname: ('gold_position' | 'ario_position') = (gqlUrl.includes('goldsky')) ? 'gold_position' : 'ario_position'
		const readPosition = async()=> (await db<StateRecord>('states').where({ pname }))[0].value
		let position = await readPosition()
		let topBlock = await getGqlHeight(gqlUrl)
		const initialHeight = topBlock // we do not want to keep calling getTopBlock during initial catch up phase

		logger(gqlUrl, 'Starting scanner position', position, 'and weave height', topBlock)

		const calcBulkBlocks = (position: number) => {
			if(position < 150000) return 1000
			if(position < 350000) return 100
			if(position < 776000) return 50
			return 1
		}
		
		let numOfBlocks = calcBulkBlocks(position)

		let min = position + 1
		let max = min + numOfBlocks - 1

		while(true){
			try {
				const t0 = performance.now()

				if((initialHeight - max) > 50){
					numOfBlocks = calcBulkBlocks(max)
				} else if(max + TRAIL_BEHIND >= topBlock){ // wait until we have enough blocks ahead
					numOfBlocks = 1
					max = min
					topBlock = await waitForNewBlock(max + TRAIL_BEHIND, gqlUrl)
				}

				const numMediaFiles = await scanBlocks(min, max, gqlUrl)
				logger(gqlUrl, 'results.', 
					`media files: ${numMediaFiles}, ${pname}: ${max}, topBlock: ${topBlock}`
				)

				// there might be more than 1 scanner running (replacing)
				const dbPosition = await readPosition()
				if(dbPosition < max){
					await db<StateRecord>('states')
						.where({ pname })
						.update({value: max})
				}else{
					max = dbPosition
				}

				min = max + 1 
				max = min + numOfBlocks - 1

				const tProcess = performance.now() - t0
				// let timeout = 2000 - tProcess
				// if(timeout < 0) timeout = 0
				console.log(gqlUrl, `scanned ${numOfBlocks} blocks in ${tProcess} ms.`)// pausing for ${timeout}ms`)
				// await sleep(timeout) //slow down, we're getting rate-limited 

			} catch(e:any) {
				logger(gqlUrl, 'Error!', 'Scanner fell over. Waiting 30 seconds to try again.')
				logger(await si.mem())
				await sleep(30000)
			}
		}///end while(true)
	} catch(e:any) {
		logger(gqlUrl, 'UNHANDLED Error in scanner!', e.name, ':', e.message)
		logger(await si.mem())
		slackLogger(gqlUrl, 'UNHANDLED Error in scanner!', e.name, ':', e.message)
	}
}

