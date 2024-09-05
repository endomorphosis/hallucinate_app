#!/usr/bin/env node

import minimist from 'minimist'
import chalk from 'chalk'
import { createNew, listAll } from './configs.js'
import { runWorker, runBeacon } from './run.js'

console.log(`\n*** tasknet cli v1.0.0 ***\n`)

const args = minimist(process.argv.slice(2))

switch(args._[0]){
	case 'new': {
		console.log('create a new network in current directory\n')
		await createNew(args)
		break
	}

	case 'list': {
		console.log('list all network configs\n')
		await listAll(args)
		break
	}

	case 'run': {
		switch(args._[1]){
			case 'worker': {
				console.log('run worker on current device\n')
				await runWorker(args)
				break
			}

			case 'beacon': {
				console.log('run beacon on current device\n')
				await runBeacon(args)
				break
			}

			default: {
				console.log('pick one of the node types: worker, beacon')
				break
			}
		}
		break
	}

	default: {
		console.log(`usage: tasknet [COMMAND]`)
		console.log(`available commands are:`)
		console.log(``)
		console.log(`- ${chalk.bold(`tasknet new`)}`)
		console.log(chalk.gray(`  create a new network config in current directory`))
		console.log(``)
		console.log(`- ${chalk.bold(`tasknet list`)}`)
		console.log(chalk.gray(`  list all network in current directory`))
		console.log(``)
		console.log(`- ${chalk.bold(`tasknet run (worker|beacon)`)}`)
		console.log(chalk.gray(`  run a node on the current device`))
		console.log(``)
		console.log(`- ${chalk.bold(`tasknet shell`)}`)
		console.log(chalk.gray(`  administrative shell into running network`))
		console.log(``)
	}
}