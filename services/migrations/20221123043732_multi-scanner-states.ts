import { Knex } from "knex";
import { StateRecord } from '../src/common/shepherd-plugin-interfaces/types' 

export async function up(knex: Knex): Promise<void> {
	await knex<StateRecord>('states').insert([ 
		{ pname: 'ario_position', value: 90_000}, //there's nothing before this but ario returns a buggy tx
		{ pname: 'gold_position', value: 90_000},
	])
}


export async function down(knex: Knex): Promise<void> {
	await knex<StateRecord>('states').where({ pname: 'gold_position' }).delete()
	await knex<StateRecord>('states').where({ pname: 'ario_position' }).delete()
}

