import axios from 'axios'
import { IncomingMessage } from 'http'
import { NO_STREAM_TIMEOUT, VID_TMPDIR } from '../constants'
import fs from 'fs'
import ffmpeg from 'ffmpeg'
import filetype from 'file-type'
import { logger } from '../utils/logger'


export const checkVidTxid = async(txid: string)=> {

}

export const videoDownload = async(txid: string)=> {
	return new Promise(async(resolve, reject)=> {

		const url = 'https://arweave.net/' + txid
		const filewriter = fs.createWriteStream(VID_TMPDIR + txid, {encoding: 'binary'})
	
		const source = axios.CancelToken.source()
		let timer: NodeJS.Timeout | null = null
		
		try{
			
			const { data, headers } = await axios.get(url, {
				cancelToken: source.token,
				responseType: 'stream',
			})

			const contentLength = headers['content-length']

			timer = setTimeout( ()=>{
				source.cancel()
				logger(txid, `Logging only => timeout of ${NO_STREAM_TIMEOUT}ms exceeded`)
			}, NO_STREAM_TIMEOUT )
			
			const stream: IncomingMessage = data
			
			let buffers: Uint8Array[] = []
	
			stream.on('data', (buffer: Uint8Array)=>{
				clearTimeout(timer!)
				// if(buffer.length < 4100){
				// 	buffers.push(buffer)
				// }
				filewriter.write(buffer)
			})
	
			stream.on('end', ()=>{
				logger(txid, 'END')
				filewriter.end()
				resolve(true)
			})
	
			stream.on('error', (e: Error)=>{
				logger(txid, 'READ STREAM ERROR:', e.message)
				filewriter.end()
				reject(e)
			})
	
		}catch(e){
			logger(txid, 'SOME ERROR HERE')
			if(timer){
				clearTimeout(timer)
			}
			filewriter.end()
			reject(e)
		}
	})//end Promise
}