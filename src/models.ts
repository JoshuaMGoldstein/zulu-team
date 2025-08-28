import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { publicdb } from './supabase';

dotenv.config();

export interface Model {
  id: string;
  name: string;
  description: string;
  provider: string;
  supported_parameters: string[];
  category: 'tool' | 'flash';
}

/**
 * Fetches the list of OpenRouter models available to the user, filters for those that support both
 * "tools" and "reasoning" parameters, and upserts to Supabase models table.
 * This function is intended to be called during application startup.
 */
export async function updateModelsInSupabase(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENROUTER_API_KEY not set; skipping OpenRouter model fetch.');
    return;
  }

  // Wrap https request in a Promise for async/await usage
  const fetchModels = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
      const apiKey = process.env.OPENROUTER_API_KEY;
      
      https.get(`${baseUrl}/models/user`, {
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

    // Prepare models for Supabase
    const allModels: Model[] = [];
    
    // Track which models appear in which categories
    const modelCategories = new Map<string, Set<string>>();
    
    // Tool models
    [...geminiModels, ...claudeModels, ...moonshotModels, ...toolModels].forEach(model => {
      if (!modelCategories.has(model.id)) {
        modelCategories.set(model.id, new Set());
      }
      modelCategories.get(model.id)!.add('tool');
    });
    
    // Flash models
    [...geminiModels, ...claudeModels, ...moonshotModels, ...flashModels].forEach(model => {
      if (!modelCategories.has(model.id)) {
        modelCategories.set(model.id, new Set());
      }
      modelCategories.get(model.id)!.add('flash');
    });

    // Create entries with correct category assignment
    const modelsToUpsert: any[] = [];
    modelCategories.forEach((categories, modelId) => {
      const baseModel = [...geminiModels, ...claudeModels, ...moonshotModels, ...toolModels, ...flashModels]
        .find(m => m.id === modelId);
      
      if (baseModel) {
        const category = categories.size === 2 ? 'tool,flash' : Array.from(categories)[0];
        modelsToUpsert.push({
          id: modelId,
          name: baseModel.name,
          display_name: baseModel.name,
          description: baseModel.description,
          provider: baseModel.provider,
          supported_parameters: baseModel.supported_parameters,
          category: category,
          context_window: 128000,
          cost_per_1k_tokens: 0.01,
          frequency_penalty: 0,
          max_tokens: 4000,
          presence_penalty: 0,
          temperature: 0.7,
          top_p: 1.0,
          model_name: modelId
        });
      }
    });

    const { error } = await publicdb
      .from('models')
      .upsert(modelsToUpsert, {
        onConflict: 'id'
      });

    if (error) {
      console.error('Error upserting models to Supabase:', error);
    } else {
      console.log(`Upserted ${modelsToUpsert.length} models to Supabase`);
    }
  } catch (error) {
    console.error('Error fetching OpenRouter models:', error);
  }
}