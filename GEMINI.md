# Zulu Team Project

This project contains two servers:
1.  A management GUI on port 3000.
2.  An API server on port 3001 for communicating with Discord bots.

## Key Files

*   `bot-instances/instances.json`: A list of the bot instances and their configurations.
*   `projects.json`: A list of the projects that can be managed by the bots.

## Management GUI

The management GUI on port 3000 allows you to:
*   Add, edit, and view bot instances.
*   Add, edit, and view projects.

## Running the Project

*   To start the development server with hot reloading, run: `npm run dev`
*   To build the project, run: `npm run build`
*   To start the server in production, run: `npm start`
