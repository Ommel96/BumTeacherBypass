export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { listProviders, getProvider, createProvider, updateProvider, deleteProvider, getProviderConfig } from '@/lib/providers-store';
import { AIProvider } from '@/lib/ai-provider';
import type { ProviderType } from '@/lib/ai-provider';

export async function GET() {
  try {
    const providers = listProviders();
    return NextResponse.json(providers);
  } catch (error) {
    console.error('Get providers error:', error);
    return NextResponse.json({ error: 'Failed to list providers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, api_key, base_url, model, custom_models, testConnection } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and type are required' }, { status: 400 });
    }

    const validTypes: ProviderType[] = ['openai', 'anthropic', 'ollama', 'ollama-cloud', 'openai-compatible'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid provider type' }, { status: 400 });
    }

    const provider = createProvider({ name, type, api_key, base_url, model, custom_models });

    if (testConnection) {
      try {
        const config = getProviderConfig(provider.id);
        const aiProvider = new AIProvider(config);
        const result = await aiProvider.testConnection();
        return NextResponse.json({ provider, connectionTest: result });
      } catch (e) {
        return NextResponse.json({ provider, connectionTest: { ok: false, error: e instanceof Error ? e.message : String(e) } });
      }
    }

    return NextResponse.json(provider, { status: 201 });
  } catch (error) {
    console.error('Create provider error:', error);
    return NextResponse.json({ error: 'Failed to create provider' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, type, api_key, base_url, model, custom_models, testConnection } = body;

    if (!id) {
      return NextResponse.json({ error: 'Provider ID is required' }, { status: 400 });
    }

    const updates: Partial<{ name: string; type: ProviderType; api_key: string; base_url: string; model: string; custom_models: string }> = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (api_key !== undefined) updates.api_key = api_key;
    if (base_url !== undefined) updates.base_url = base_url;
    if (model !== undefined) updates.model = model;
    if (custom_models !== undefined) updates.custom_models = custom_models;

    const provider = updateProvider(id, updates);
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    if (testConnection) {
      try {
        const config = getProviderConfig(provider.id);
        const aiProvider = new AIProvider(config);
        const result = await aiProvider.testConnection();
        return NextResponse.json({ provider, connectionTest: result });
      } catch (e) {
        return NextResponse.json({ provider, connectionTest: { ok: false, error: e instanceof Error ? e.message : String(e) } });
      }
    }

    return NextResponse.json(provider);
  } catch (error) {
    console.error('Update provider error:', error);
    return NextResponse.json({ error: 'Failed to update provider' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Provider ID is required' }, { status: 400 });
    }

    const deleted = deleteProvider(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Delete provider error:', error);
    return NextResponse.json({ error: 'Failed to delete provider' }, { status: 500 });
  }
}