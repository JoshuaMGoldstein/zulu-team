import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';



/**
 * Fetches the list of OpenRouter models available to the user, filters for those that support both
 * "tools" and "reasoning" parameters, and writes a simplified list to `models.json` at the project root.
 * This function is intended to be called during application startup.
 */
export async function updateModelsFile(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set; skipping OpenRouter model fetch.');
    return;
  }

  // Wrap https request in a Promise for async/await usage
  const fetchModels = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      https.get('https://openrouter.ai/api/v1/models/user', {
        headers: { Authorization: `Bearer ${apiKey}` }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', err => reject(err));
    });
  };

  try {
    const response: any = await fetchModels();

    // Moonshot models (always first)
    const moonshotModels = [
      {
        id: 'kimi-k2-0711-preview',
        name: 'Moonshot Kimi K2 0711 Preview',
        description: 'Moonshot Kimi K2 0711 Preview model',
        provider: 'moonshot',
        supported_parameters: ['tools', 'reasoning', 'response_format', 'structured_outputs']
      },
      {
        id: 'kimi-k2-turbo-preview',
        name: 'Moonshot Kimi K2 Turbo Preview',
        description: 'Moonshot Kimi K2 Turbo Preview model',
        provider: 'moonshot',
        supported_parameters: ['tools', 'reasoning', 'response_format', 'structured_outputs']
      }
    ];

    // OpenRouter models that support both tools and reasoning
    const toolModels = (response?.data ?? []).filter((model: any) => {
      const supported = (model?.supported_parameters ?? []).map((p: string) => p.toLowerCase());
      return supported.includes('tools') && supported.includes('reasoning');
    }).map((model: any) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      provider: 'openrouter',
      supported_parameters: model.supported_parameters,
    }));

    // OpenRouter models that support response_format and structured_outputs (flash models)
    const flashModels = (response?.data ?? []).filter((model: any) => {
      const supported = (model?.supported_parameters ?? []).map((p: string) => p.toLowerCase());
      return supported.includes('response_format') && supported.includes('structured_outputs');
    }).map((model: any) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      provider: 'openrouter',
      supported_parameters: model.supported_parameters,
    }));

    // Hard-coded Gemini & Claude models
    const geminiModels = [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Google Gemini 2.5 Pro', provider: 'gemini', supported_parameters: ['tools', 'reasoning'] },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Google Gemini 2.5 Flash', provider: 'gemini', supported_parameters: ['tools', 'reasoning'] },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', description: 'Google Gemini 2.5 Flash Lite', provider: 'gemini', supported_parameters: ['tools', 'reasoning'] },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Google Gemini 2.0 Flash', provider: 'gemini', supported_parameters: ['tools', 'reasoning'] }
    ];
    const claudeModels = [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Anthropic Claude Sonnet 4', provider: 'anthropic', supported_parameters: ['tools', 'reasoning'] },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Anthropic Claude Opus 4', provider: 'anthropic', supported_parameters: ['tools', 'reasoning'] }
    ];

    const outPath = path.resolve(__dirname, '../models.json');
    const output = {
      toolmodels: [...geminiModels, ...claudeModels, ...moonshotModels, ...toolModels],
      flashmodels: [...geminiModels, ...claudeModels, ...moonshotModels, ...flashModels]
    };
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`Wrote ${output.toolmodels.length} tool models and ${output.flashmodels.length} flash models to ${outPath}`);
  } catch (error) {
    console.error('Error fetching OpenRouter models:', error);
  }
}
