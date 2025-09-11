Part of me thinks the code that Initializes GCS Resources and creates/populates buckets (eg, for NEW accounts) should be a totally separate service than the rest of configmanager... And if configmanager wants to trigger it, it has to do so asynchronously.

But that still leaves the issue of how GUI.ts can share configmanager.ts with  And also how changes can persist in realtime to the central management server so they are immediately effective, if they aren't posted there, then the central management server would at LEAST need an event to know to reload the entire account upon any edit being made.

```bash
================================
SHOW STOPPING - BACKEND MASTER SERVER ISSUES
================================
+ Non-Public deployment issue  [for staging sites] {MUST BE PERMANENTLY FIXED AND THE DEFAULT SERVICE ACCT DISABLED ! fixed temporarily using the default service account, but this is problematic security wise. temp fix needs testing }

- Bot Invites!
- ORDER OF OPERATIONS ISSUE for QA [ commt/push Dockerfile, then DEPLOY ]  (post-commit hook?)
- BuildServer-Docker Pooling
- Give QA direct access to logs and deployment stuff (GCLOUD?)
- Support metadata commits (Can we support commits calling the server to do a push, and returning control without interrupting the bot? use setuid as git user?)

- Traefik so they dont HAVE to be public [see non-public deployment issue]
================================
SHOW STOPPING - WEB
================================
- Team Invites

- Platform Invites [a Whitelist for non-invited users by email address, eg, account creators]

- Bot Invites [how does this work with the MASTER SERVER?]

- Record Bot Logs and UI for reading Bot logs (w/ realtime output detailed log so you can know WTF is going on under the hood like I do)

- SECRETS MANAGEMENT VIA GUI (per PROJECT & ENVIROMENT), because bots cannot reasonably handle updating them without making mistakes ...
...not totally show stopping...
- Fixing UI stuff w/ new Vue# interface

=================================
LOCAL USE CASE - allow *local* bots to operate with the system, with supabase auth identification?
=================================
Tools-based / Authenticated MCP based publishing *with user approvals*
Access to all GCloud facilities

=================================
Dedicated server integration
=================================
Allow publishing to your own dedicated server 'k8 cloud' by installing our GKE docker-management equivalent
Logs and whatnot

=================================
Either way we still need Traefik, but we should use the bots to build it onto google cloud
Then I can simply install it on the dedicated server by pulling the image
If the server had a lightweight 'k8' cluster, you could use it as a service mesh
=================================

```


.. sorta show stopping..

================================

===============================
NON-SHOW STOPPING?
===============================
+ Commits / Branching / Messages 

- CI/CD autoworkflow / how/when to clear branches [ delete them after they have been successfully merged into main branch]
- Tagging releases and versioning

- Wakeups / Eventing
- ROADMAP processing
- PUBLIC Website where user on unique IP can get a limited # of credits without even regitering to interact with system
- Website area (logged in, public) where you can chat with the bots on per project-channel without being in discord/slack etc.

+ Cloud Deployment

/ QA / Testing Process w/ integrated deploy
/ Staging/Prod deploys
================================


+a.	PROJECT MOUNTING SYSTEM
 -  We need to support having SSH keys and mounting the GIT Repos for the bots. 
+b.	Commits and branches such
-	We should determine the branch edits are being done on, the bot itself shouldn’t manage that.
-	We should commit code for the bot only after its been tested by QA, etc.
c.	Perhaps we will have an interactive system for the user to try things before committing /pushing code. Or perhaps we will commit but not push. May depend on global settings

+SETTINGS FOR MANAGING CONTEXT WINDOW, COMPRESSING, LIMITING HISTORY
- Modify Gemini CLI to compact and limit context window usage
-	
+d.	BOT REQUEST QUEUING SYSTEM
-	Make sure bots can’t be processing two requests at once by having an ordered queuing system.

+- (traefik needed) e.	DEVOPS STUFF FOR PUBLISHING (Cloudflare, BunnyCDN?)
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
+-g.	STAGING/PROD PUBLISHING
-	

+h.	INTEGRATE OPENAPI / OPENROUTER FOR GEMINI CLI
i.	SUPPORT CLAUDE AGAIN

+j.	MULTI-TENANT CAPABILITY? USE SUPABASE FOR SETTINGS?
- Move all the .json files to Supabase PostgreSQL and support multi-tenant.
k.	PER-PROJECT BOT CONTEXT CAPABILITY 
l.	BRING YOUR OWN API KEYS?
- Allow 


m.	LIMIT BOT ACCESS TO API KEYS (/chat/completions)  [should this be a DIFFERENT service?]
n.	RECORD USAGE STATISTICS, BILLING (/chat/competions) [should this be a DIFFERENT service?]


o.	What else?
+p.	FILESHARING SYSTEM FOR BOT-INSTANCES USING GSCFUSE

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




===========
WEBSITE DESIGN
===========


We need to finish the development to incorporate the new views into the Dashboard. The prior developer build many new .vue files, in client/views: BotsView, EnvionmentsVue,GitKeysVue,InvitesView,LogsView,ProjectsViewmRolesView,SecretsView,SettingsView,and UsersView.
These views are supposed to go into a new Dashboard that incorporates a left hand side collapsable navigation bar. The organization of the dashboard is supposed to work as follows: The left hand navigation panel is collapsable to show only its icons. When shown, each menu item (except the first one for account selection) is expandable to show subitems, like an accordion view . The main items from top to bottom are:
#1) Account [the dropdown menu that lets you switch to a totally different Account if your user is associated with multiple Accounts]. It should show the active account.
#2) Users
  - Users
  - Invites
#3) Bots
 - Bot Instances
 - Channels 
#4) Projects
  - Projects
  - Git Keys
  - Environments
#5) Log Viewer
  - Logs
#6) Help
  - Help
Each of the subitems, when selected, causes the dashboard to navigate to a screen which takes up the entire display except the lefthand navbar. Most of the screens contain a list of the items referred to here presented across the whole display. Above the list on the top left, there is a Title and subtitle for each screen, and on the top right there is usually an "Add" button, such as Add User, Add Bot Instance, Invite User, Add Channel, Add Project, Add Git Key, etc. The screens can have filters or a search box if appropriate immediately above the list of items. On the right side of each item, as apporpirate (except for Logs) you can have an edit button. The add and edit button use the same lightbox popup dialog to edit or add a new item of that kind.

The log viewer just shows a list, there is no add buton but just a set of filters / search box.
The help screen is just a placeholder with the help information coming soon

The main website's header/navigfation is supposed to be moved to a top bar, and should dissapear once you are logged in and on the dashboard page.

Please review the new vue3 project in src/client as well as the legacy dashboard in public/old-dashboard which has much of the same functionality discussed above in a simplified javascript implementation. The lightboxes and lists will generally need to work exactly the same as in that old legay dashboard, so you should review that thoroughly. 

get_user_account_id()