import { InflightsRecord, TxRecord } from '../types'
import getDbConnection from '../utils/db-connection'
import { logger } from '../utils/logger'


const knex = getDbConnection()


export const updateDb = async(txid: string, updates: Partial<TxRecord>)=> {
	try{
		const checkId = await knex<TxRecord>('txs').where({txid}).update(updates, 'txid')
		if(checkId[0] !== txid){
			logger(txid, 'ERROR UPDATING DATABASE!', JSON.stringify(updates))
		}
		return checkId[0];

	}catch(e:any){
		logger(txid, 'ERROR UPDATING DATABASE!', e.name, ':', e.message)
		logger(txid, e) // `throw e` does nothing, use the return
	}
}


export const dbNoDataFound404 = async(txid: string)=> {
	return updateDb(txid,{
		flagged: false,
		valid_data: false,
		data_reason: '404',
		last_update_date: new Date(),
	})
}

export const dbNoDataFound = async(txid: string)=> {
	return updateDb(txid,{
		flagged: false,
		valid_data: false,
		data_reason: 'nodata',
		last_update_date: new Date(),
	})
}

export const dbCorruptDataConfirmed = async(txid: string)=> {
	return updateDb(txid,{
		flagged: false,
		valid_data: false,
		data_reason: 'corrupt',
		last_update_date: new Date(),
	})
}

export const dbCorruptDataMaybe = async(txid: string)=> {
	return updateDb(txid,{
		// flagged: false, <= try filetype detection first
		valid_data: false,
		data_reason: 'corrupt-maybe',
		last_update_date: new Date(),
	})
}

export const dbPartialImageFound = async(txid: string)=> {
	return updateDb(txid,{
		// flagged: <= cannot flag yet! display with puppeteer & rate again
		valid_data: false, // this removes it from current queue
		data_reason: 'partial',
		last_update_date: new Date(),
	})
}

export const dbPartialVideoFound = async(txid: string)=> {
	return updateDb(txid,{
		// flagged: undefined,  // this gets set in the normal way in another call
		// valid_data: undefined,
		data_reason: 'partial-seed', //check later if fully seeded
		last_update_date: new Date(),
	})
}

export const dbOversizedPngFound = async(txid: string)=> {
	return updateDb(txid,{
		// flagged: <= cannot flag yet! use tinypng, then rate again
		valid_data: false, // this removes it from current queue
		data_reason: 'oversized',
		last_update_date: new Date(),
	})
}

export const dbTimeoutInBatch = async(txid: string)=> {
	return updateDb(txid,{
		// flagged: <= need recheck: may be due to other delay during timeout or data not seeded yet
		valid_data: false,
		data_reason: 'timeout',
		last_update_date: new Date(),
	})
}

export const dbWrongMimeType = async(txid: string, content_type: string)=> {
	return updateDb(txid,{
		// this will be retried in the relevant queue
		content_type,
		data_reason: 'mimetype',
		last_update_date: new Date(),
	})
}

export const dbNoMimeType = async(txid: string)=> {
	return updateDb(txid,{
		flagged: false,
		content_type: 'undefined',
		data_reason: 'mimetype',
		last_update_date: new Date(),
	})
}

export const dbUnsupportedMimeType = async(txid: string)=> {
	return updateDb(txid,{
		// flagged: <= cannot flag yet! display with puppeteer & rate again
		valid_data: false, // this removes it from current queue
		data_reason: 'unsupported',
		last_update_date: new Date(),
	})
}

export const dbInflightDel = async(txid: string)=> {
	try{
		const ret = await knex<InflightsRecord>('inflights').where({ txid, }).del('txid')
		if(ret[0] !== txid){
			logger(txid, 'DB_ERROR DELETING FROM INFLIGHTS')
		}
		return ret[0];
	}catch(e:any){
		logger(txid, 'DB_ERROR DELETING FROM INFLIGHTS', e.name, ':', e.message)
		logger(txid, e) // `throw e` does nothing, use the return
	}
}

export const dbInflightAdd = async(txid: string)=> {
	try{
		//knex just not up to the task in this case :-(

		const ret = await knex.raw(`INSERT INTO inflights (txid, foreign_id)
			SELECT '${txid}', id AS foreign_id FROM txs WHERE txid='${txid}'
			RETURNING txid;`
		)
		//consider adding ON CONFLICT DO NOTHING ?

		if(ret[0] !== txid){
			logger(txid, 'DB_ERROR DELETING FROM INFLIGHTS')
		}
		return ret[0];
	}catch(e:any){
		logger(txid, 'DB_ERROR DELETING FROM INFLIGHTS', e.name, ':', e.message)
		logger(txid, e) // `throw e` does nothing, use the return
	}	
}