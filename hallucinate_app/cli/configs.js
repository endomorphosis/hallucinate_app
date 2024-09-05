import path from 'path'
import fs from 'fs'
import enquirer from 'enquirer'
import chalk from 'chalk'
import { generateAdminKeyChain, parseNetKey, createAccessToken, parseAccessToken } from '@tasknet/keychain'
import { readConfig, writeConfig } from '@tasknet/store'
import { bindStringToMultiaddrs } from './utils.js'


export async function createNew(args){
	let config = await enquirer.prompt({
		type: 'input',
		name: 'name',
		message: 'network name',
		hint: 'unique name to tell networks apart',
		validate: id => {
			if(id.length < 3)
				return 'must be at least 3 characters'

			if(!/^[a-zA-Z0-9\_]+$/.test(id))
				return 'only letters, numbers and underscore'

			return true
		}
	})

	let { useBeacon } = await enquirer.prompt({
		type: 'confirm',
		name: 'useBeacon',
		message: 'connect all nodes to a beacon by default?',
		initial: true,
		hint: 'this greatly simplifies connecting nodes'
	})

	if(useBeacon){
		config = {
			...config,
			...await enquirer.prompt({
				type: 'input',
				name: 'beacon',
				initial: 'p2p.hallucinate.app',
				message: 'beacon address(es)',
				hint: 'can be domain names or ipv4 addresses with port, seperated by a comma, without spaces',
				validate: input => {
					try{
						bindStringToMultiaddrs({ bindString: input, protocol: 'ws' })
					}catch(e){
						return 'must be a valid ip or domain name'
					}
					
					return true
				}
			})
		}
	}

	let netkey = await generateAdminKeyChain()
	let configFile = path.resolve(`${config.name}.toml`)

	let adminToken = createAccessToken({ netkey, privilege: 'admin', config })
	let workerToken = createAccessToken({ netkey, privilege: 'worker', config })
	let clientToken = createAccessToken({ netkey, privilege: 'client', config })

	await writeConfig(configFile, {
		net: parseAccessToken(adminToken)
	})

	console.log(``)
	console.log(`the following config has been created and saved at ${configFile}:`)
	console.log(``)
	console.log(chalk.cyan(fs.readFileSync(configFile, 'utf-8').trim()))
	
	console.log(``)
	console.log(`the following access tokens can be used to join other nodes to this network:`)
	console.log(``)
	console.log(chalk.cyan(clientToken))
	console.log(`supply this token to clients when making requests, they will securely join the network but have no write privileges`)
	console.log(``)
	
	console.log(chalk.cyan(workerToken))
	console.log(`supply this token when launching new workers or to clients with write privileges`)
	console.log(``)
	
	console.log(chalk.cyan(adminToken))
	console.log(`use this token at a tasknet terminal to issue authoriative commands to the network`)
	console.log(``)
}

export async function listAll(args){
	let configs = await findAllConfigs()

	if(configs.length === 0)
		console.log('no network configs in the current directory')

	for(let config of configs){
		let netkey = parseNetKey(config.net.key)

		console.log(chalk.bold(`- network: ${config.net.name} (${netkey.netId.slice(-6)})`))
		console.log(`  stored key has ${netkey.privilege} privilege`)
		console.log(`  access tokens:`)

		for(let privilege of ['client', 'worker', 'admin']){
			try{
				let token = createAccessToken({
					netkey,
					privilege,
					config: config.net
				})
				console.log(`   - ${token}`)
			}catch(e){
				console.log(`   - (${privilege} token not available)`)
			}
		}

		console.log(``)
	}
}

async function findAllConfigs(){
	let files = fs.readdirSync('.')
	let configs = []

	for(let file of files){
		if(!file.endsWith('.toml'))
			continue

		try{
			let config = await readConfig(file)

			if(!config.net.name || !config.net.key)
				throw 'corrupt'

			configs.push(config)
		}catch{}
	}

	return configs
}