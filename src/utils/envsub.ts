/*
ISC License:
Copyright (c) 2004-2010 by Internet Systems Consortium, Inc. ("ISC")
Copyright (c) 1995-2003 by Internet Software Consortium
Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
THE SOFTWARE IS PROVIDED "AS IS" AND ISC DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL ISC BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/


const VARIABLE_NAME_REGEX = '[a-zA-Z_]+[a-zA-Z0-9_]*';
const config = {
  envsub: {
    DEFAULT_OPTIONS: {
      all: false,
      diff: false,
      protect: false,
      strict: false,
      syntax: 'default'
    }
  },
  envsubh: {
    DEFAULT_OPTIONS: {
      diff: false,
      strict: false
    }
  },
  regex: VARIABLE_NAME_REGEX,
  curlyRegex: (mustHaveDefaultValue:boolean, variableNameRegex = VARIABLE_NAME_REGEX) => {
    const separatorRegex = ':-';
    const conditionalSeparatorRegex = ':\+';
    const variableValueRegex = '(?:[^}{]+|\{[^}{]*\})*?'; // Non-greedy match, attempting to handle simple nesting

    // The optionalDefaultValueModifier should apply to the entire operator and value part
    const operatorAndValuePart = `((?:${separatorRegex}|${conditionalSeparatorRegex})${variableValueRegex})${mustHaveDefaultValue ? '' : '?'}`;

    return `(${variableNameRegex})(?:${operatorAndValuePart})?`; // Variable name, then optional operator/value part
  }
};

export enum SYNTAX {
    //added
    DEFAULT = 'default',

    DOLLAR_BASIC= 'dollar-basic',
    DOLLAR_CURLY= 'dollar-curly',
    DOLLAR_BOTH= 'dollar-both',
    HANDLEBARS= 'handlebars'
};


export interface EnvSubOptions {
    syntax:SYNTAX
    strict?:boolean
    protect?:boolean
    system?:boolean
    all?:boolean    
    env:Record<string,string>
}

export interface EnvSubArgs  {
    options:EnvSubOptions    
}


let dynamicRegexes = (opts:EnvSubOptions) => {

  let regexObj = (lhs:string, cleanLhs:string, rhs:string, sep:string, type?:string) => {
    return {lhs, cleanLhs, rhs, sep, type};
  };

  let dynamicRegexes = [];

  if (opts.syntax === 'default') {
    opts.syntax = SYNTAX.DOLLAR_CURLY;
  }

  if (opts.syntax === SYNTAX.DOLLAR_BASIC || opts.syntax === SYNTAX.DOLLAR_BOTH) {
    dynamicRegexes.push(regexObj('\\$', '$', '', '', opts.syntax));
  }

  if (opts.syntax === SYNTAX.DOLLAR_CURLY || opts.syntax === SYNTAX.DOLLAR_BOTH) {
    dynamicRegexes.push(regexObj('\\${', '${', '}', ' *', opts.syntax));
  }

  if (opts.syntax === SYNTAX.HANDLEBARS) {
    dynamicRegexes.push(regexObj('{{', '{{', '}}', ' *', opts.syntax));
  }

  return dynamicRegexes;
};

let substitute = (matches:string[][], contents:string, opts:EnvSubOptions) => {

  matches && matches.forEach(([match, envVarName, operatorAndValue]) => {
    let envVarValue = opts.env[envVarName];
    
    // Check for strict - fail if variable is undefined and no default value
    if (opts.strict && envVarValue === undefined && operatorAndValue === undefined) {
      throw new Error(`Environment variable '${envVarName}' is not defined`);
    }

    let operator: string | undefined;
    let value: string | undefined;

    if (operatorAndValue) {
      if (operatorAndValue.startsWith(':-')) {
        operator = ':-';
        value = operatorAndValue.substring(2);
      } else if (operatorAndValue.startsWith(':+')) {
        operator = ':+';
        value = operatorAndValue.substring(2);
      }
    }
    
    if (operator === ':-') {
      contents = contents.replace(match, (envVarValue !== undefined && envVarValue !== '' ? envVarValue : value) ?? '');
    } else if (operator === ':+') {
      contents = contents.replace(match, (envVarValue !== undefined && envVarValue !== '' ? value : '') ?? '');
    } else { // Simple ${VAR}
      contents = contents.replace(match, (envVarValue ?? ''));
    }
  });
  return contents;
};


function envSubParserHelper(contents:string, args:EnvSubArgs):string {

  let opts = args.options;
  let dRegexes = dynamicRegexes(opts);
  //opts.syntax = opts.syntax.toLowerCase();

  dRegexes.forEach((dRegex) => {

      // Find all env var matches      
      const regexp = (dRegex.type === SYNTAX.DOLLAR_CURLY || (dRegex.type === SYNTAX.DOLLAR_BOTH && dRegex.cleanLhs === '${')) ? 
        // default value support is only available with dollar-curly syntax
        [ dRegex.lhs, config.curlyRegex(false), dRegex.rhs ].join('') :
        // Fallback to everything else
        [ dRegex.lhs, dRegex.sep, `(${config.regex})`,      dRegex.sep, dRegex.rhs].join('');
      
      let matchIter = contents.matchAll(new RegExp(regexp, 'g'));
      let matches = [...matchIter].map(([match, envVarName, operatorAndValue]) => [match, envVarName, operatorAndValue]);

      //console.log(JSON.stringify(matches));

      // Substitute
      matches && matches.forEach(([originalMatch, envVarName, operatorAndValue]) => {
        let envVarValue = opts.env[envVarName];
        
        // Check for strict - fail if variable is undefined and no default value
        if (opts.strict && envVarValue === undefined && operatorAndValue === undefined) {
          throw new Error(`Environment variable '${envVarName}' is not defined`);
        }
    
        let operator: string | undefined;
        let value: string | undefined;
    
        if (operatorAndValue) {
          if (operatorAndValue.startsWith(':-')) {
            operator = ':-';
            value = operatorAndValue.substring(2);
          } else if (operatorAndValue.startsWith(':+')) {
            operator = ':+';
            value = operatorAndValue.substring(2);
          }
        }

        let replacement = '';
        if (operator === ':-') {
          replacement = (envVarValue !== undefined && envVarValue !== '' ? envVarValue : (value ?? '')) ?? '';
        } else if (operator === ':+') {
          replacement = (envVarValue !== undefined && envVarValue !== '' ? (value ?? '') : '');
        } else { // Simple ${VAR}
          replacement = (envVarValue ?? '');
        }

        contents = contents.replace(originalMatch, replacement);
      });
   
  });
  return contents;
}

export function envsubParser(contents:string, args:EnvSubArgs):string {
  contents = envSubParserHelper(contents,args);
  contents = envSubParserHelper(contents,args);

  return contents;
};

