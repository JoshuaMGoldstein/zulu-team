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

## Development Guidelines

*   Avoid overusing the `:any` type in TypeScript. Prioritize strong typing to improve code quality and prevent errors, especially in larger projects.
*   All TypeScript imports must be placed at the top of the file, before any other statements or declarations.
*   After every set of changes, run `npm run build` to verify the code compiles without errors.

## Important Notes
*   Do not tell the user to edit files or run commands; perform the actions yourself using tool calls.