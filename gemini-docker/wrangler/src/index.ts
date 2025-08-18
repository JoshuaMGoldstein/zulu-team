import { Container, getRandom, getContainer } from '@cloudflare/containers';
import { json } from 'body-parser';

export class ExecContainer extends Container {
	defaultPort = 8088;
	sleepAfter = '5m';

	override onStart() {
		console.log('Container successfully started');
	}
	override onStop() {
		console.log('Container successfully shut down');
	}
	override onError(error: unknown) {
		console.log('Container error:', error);
	}
}

interface ExecRequest {
	instanceid: string,
	env: {[key:string]:string},
	command:string
}

/*function validateExecRequest(json:any):ExecRequest {
	if(!json.instanceid || typeof json.instanceid !== "string") throw new Error("bad payload:instance")
	if(!json.command || typeof json.command !== "string") throw new Error("bad payload:command");
	if(json.env && typeof json.env !== "object") throw new Error("bad payload:env");
	if(json.env) {
		var keys = Object.keys(json.env);
		for(var k=0; k<keys.length; k++) {
			let key = keys[k];
			if(typeof json.env[key] !== "string") throw new Error("bad payload:env."+key);
		}
	}
	return json as ExecRequest;
}*/

export default {
	async fetch(request: Request, env): Promise<Response> {		
		
		return getContainer(env.EXEC_CONTAINER).fetch(request);
		
		/*let instanceid = url.searchParams.get("instanceid"); //use querystring for instanceid because request might be WSS.		
		if(!instanceid) {
			instanceid="one";
		}
		let idOne = env.EXEC_CONTAINER.idFromName(instanceid);
		let instanceOne = env.EXEC_CONTAINER.get(idOne);

		//instanceOne.startAndWaitForPorts(8088);
		await instanceOne.start({envVars:{}});						
		var res = await instanceOne.fetch(request);					
		//instanceOne.stop()
		return res;*/

	}
} satisfies ExportedHandler<Env>;