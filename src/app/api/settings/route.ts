export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/settings-store';
import { AIProvider } from '@/lib/ai-provider';

export async function GET() {
  try {
    const settings = getSettings();
    return NextResponse.json({
      provider: settings.provider,
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
      customModels: settings.customModels,
      lightweightModel: settings.lightweightModel,
      autoClassify: settings.autoClassify,
    });
  } catch (error) {
    console.error('Get settings error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to get settings';
    return NextResponse.json({ error: msg, hint: 'If you see a native module error, run this app in Docker (docker compose up -d --build) instead of locally with npm.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, apiKey, baseUrl, model, customModels, lightweightModel, autoClassify, testConnection } = body;

    if (provider && !['openai', 'anthropic', 'ollama', 'ollama-cloud', 'openai-compatible'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    const updates: Record<string, string> = {};
    if (provider) updates.provider = provider;
    if (apiKey !== undefined) updates.apiKey = apiKey;
    if (baseUrl !== undefined) updates.baseUrl = baseUrl;
    if (model !== undefined) updates.model = model;
    if (customModels !== undefined) updates.customModels = customModels;
    if (lightweightModel !== undefined) updates.lightweightModel = lightweightModel;
    if (autoClassify !== undefined) updates.autoClassify = String(autoClassify);

    if (Object.keys(updates).length > 0) {
      saveSettings(updates);
    }

    if (testConnection) {
      const currentSettings = getSettings();
      const providerInstance = new AIProvider({
        provider: currentSettings.provider,
        apiKey: currentSettings.apiKey,
        baseUrl: currentSettings.baseUrl,
        model: currentSettings.model,
      });

      const result = await providerInstance.testConnection();
      return NextResponse.json({ ok: true, connectionTest: result });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Save settings error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to save settings';
    return NextResponse.json({ error: msg, hint: 'If you see a native module error, run this app in Docker (docker compose up -d --build) instead of locally with npm.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { field } = body;

    if (field === 'apiKey') {
      saveSettings({ apiKey: '' });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
  } catch (error) {
    console.error('Delete settings error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}