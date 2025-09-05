+ Commits / Branching / Messages
- Cloud Deployment
- Secrets Management
- QA / Testing Process w/ integrated deploy
- Staging/Prod deploys



a.	PROJECT MOUNTING SYSTEM
 -  We need to support having SSH keys and mounting the GIT Repos for the bots.
 
b.	Commits and branches such
-	We should determine the branch edits are being done on, the bot itself shouldn’t manage that.
-	We should commit code for the bot only after its been tested by QA, etc.
c.	Perhaps we will have an interactive system for the user to try things before committing /pushing code. Or perhaps we will commit but not push. May depend on global settings
SETTINGS FOR MANAGING CONTEXT WINDOW, COMPRESSING, LIMITING HISTORY
- Modify Gemini CLI to compact and limit context window usage
-	
d.	BOT REQUEST QUEUING SYSTEM
-	Make sure bots can’t be processing two requests at once by having an ordered queuing system.
e.	DEVOPS STUFF FOR PUBLISHING (Cloudflare, BunnyCDN?)
- We need to support the ability to provide a link to access the project
- I think the user should be able to access the project on the dev box itself, so maybe via Cloudflare tunneling?

but as far as how other ppl will use it, thats a whole different stage of development im not even close to letting other ppl use it
i have to add a real database etc first for this data instead of storing it all in json on disk (edited)
shouldnt take long, kimi can do that ez
and i gotta get it to spawn cloud-hosted docker instances on BunnyCDN or whatever provider, so i can have an infinite # of them (edited)
For actual production and staging deployment, there are gonna be a few modes
1) CDN-Only deployment [ for static websites on staging/production , or to provide download links for other types of apps. ]
2) Local Docker based deployment [ for reviewing stuff in dev, no public access ]
3) Cloud-Docker based deployment [ for stuff requiring a backend, staging, production ] (edited)
In the final version also ppl wont manage the discord-bot-token directly of course, because they will just "invite" the bots to their channel to set things up, via a normal bot install link (edited)
But you may need to provide other stuff for using it on other systems like Slack etc in the future. And probably I will support you providing your own discord token in case u want to rename the bot etc

PARAMETERS FOR DEPLOYMENT WORKFLOW (upcoming):

1.	AccountID – The ID of the account holder of the projects [this is not used yet]
2.	Project Name – The name of the project
3.	Git Url – The github/gitlab url of the project
4.	SSH Key or Personal Access Token – Needed to clone the git repo
5.	Branch – The branch to publish
6.	Target – Production or Staging


f.	CREDENTIALS MANAGEMENT AND TOOLS
-
 
g.	STAGING/PROD PUBLISHING
-	

h.	INTEGRATE OPENAPI / OPENROUTER FOR GEMINI CLI

i.	SUPPORT CLAUDE AGAIN
j.	MULTI-TENANT CAPABILITY? USE SUPABASE FOR SETTINGS?
- Move all the .json files to Supabase PostgreSQL and support multi-tenant.

k.	PER-PROJECT BOT CONTEXT CAPABILITY 

l.	BRING YOUR OWN API KEYS?
- Allow 
m.	LIMIT BOT ACCESS TO API KEYS (/chat/completions)
n.	RECORD USAGE STATISTICS, BILLING (/chat/competions)
o.	What else?
p.	FILESHARING SYSTEM FOR BOT-INSTANCES USING GSCFUSE

The settings.json file can also have an object called "autosave" added      │
│   which includes  "compressafter": {tokencount}, "", "maxcheckpointitems": {number},




NOTES:


This means:

No Feedback Loop: The delegating bot (e.g., zulu-manager) has no way of knowing if the task was successful, what the result was, or if there were any errors. It just fires off the request and hopes for the best.,
No Logging of the Delegated Task's Execution: The ApiServer's event loop, which is responsible for writing to the .jsonl log files, is only triggered by Discord messages, not by these internal, bot-to-bot delegations.,

To make this truly functional, we would need to:

Modify the /delegated-task endpoint to await the promise returned by activateBot.,
Implement a similar event-processing loop as the one in the Discord message handler to log the delegated task's execution.,
Decide on a mechanism to return the result of the delegated task to the original bot that made the request. This could be complex, potentially involving another webhook or a polling mechanism.,

In short, the endpoint can trigger a bot, but the crucial feedback and logging loop is not yet in place for delegated tasks. (edited)

- We should create global settings to determine how much verbosity we want to allow from delegated bot replies. ie, we may only want to see tool hook info and not the actual STDOUT.  We should add these settings to a global-settings.json  and role-settings.json file in the bot-instances folder which can be edited using a seperate button in the GUI to set the delegated verbosity level.

