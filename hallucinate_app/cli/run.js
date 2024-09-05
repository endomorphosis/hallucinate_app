import path from 'path'
import { pathToFileURL } from 'url'
import { generateKey, parseAccessToken } from '@tasknet/keychain'
import { bindStringToMultiaddrs, mergeArgsIntoConfig } from './utils.js'
import { readConfig, writeConfig } from '@tasknet/store'


export async function runWorker(args){
	try{
		var { startWorker } = await import(
			pathToFileURL(path.resolve('./node_modules/@tasknet/worker/init.js'))
		)
	}catch(error){
		console.error(`worker module not installed: ${error.message.split('imported from')[0]}`)
		console.error(`install worker module by running "npm i @tasknet/worker"`)
		process.exit(1)
	}
	
	let config
	let configFile

	if(args._[2]){
		configFile = args._[2].endsWith('.toml')
			? args._[2]
			: `${args._[2]}.toml`

		try{
			config = await readConfig(configFile)
			config.store = { dir: config.net.name }
		}catch(error){
			console.error(`cannot read config at ${configFile}: ${error.message}`)
			process.exit(1)
		}
	}else if(args.access){
		try{
			config = {
				net: parseAccessToken(args.access)
			}
		}catch(error){
			console.error(`malformed access token: ${error.message}`)
			process.exit(1)
		}

		configFile = path.resolve(`${config.net.name}.toml`)

		try{
			var localConfig = await readConfig(configFile)
		}catch{}

		if(localConfig){
			console.log(`existing local config with same network name at ${configFile}, using it instead`)
			config = localConfig
		}else{
			console.log(`writing config from access key to ${configFile}`)
			await writeConfig(configFile, config)
		}
	}else{
		console.error(`no access token or network config file was provided`)
		console.log(`to list all available configs in the current directory run "npx tasknet list"`)
		console.log(`to launch using network access token run "npx tasknet run worker --access [token]"`)
		process.exit(1)
	}

	if(!config.worker){
		config.worker = {
			dir: path.resolve(config.net.name),
			identityKey: await generateKey()
		}
		await writeConfig(configFile, config)

		console.log(`set worker directory to ${config.worker.dir}`)
		console.log(`generated worker identity key: ${config.worker.identityKey}`)
		console.log(`the updated config has been written to ${configFile}`)
	}

	config = mergeArgsIntoConfig({
		net: config.net,
		...config.worker
	}, args)

	if(config.bind)
		config.listen = bindStringToMultiaddrs({
			bindString: config.bind.toString()
		})

	console.log()

	await startWorker({ config })
}


export async function runBeacon(args){
	try{
		var { startBeacon } = await import(
			pathToFileURL(path.resolve('./node_modules/@tasknet/beacon/init.js'))
		)
	}catch(error){
		console.error(`beacon module not installed: ${error.message.split('imported from')[0]}`)
		console.error(`install beacon module by running`)
		console.error(`> npm i @tasknet/beacon`)
		process.exit(1)
	}

	let config = {
		listen: args.bind
			? bindStringToMultiaddrs({
				bindString: args.bind.toString(), 
				protocol: 'ws', 
				defaultPort: 40001
			})
			: ['/ip4/0.0.0.0/tcp/40001/ws'],
		log: {
			level: args.log?.level || 'info'
		}
	}

	await startBeacon({ config })
}