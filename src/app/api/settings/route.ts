export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/settings-store';
import { getProviderConfigForRole, getProviderConfig } from '@/lib/providers-store';
import { AIProvider } from '@/lib/ai-provider';

export async function GET() {
  try {
    const settings = getSettings();
    return NextResponse.json({
      defaultProviderId: settings.defaultProviderId,
      lightweightProviderId: settings.lightweightProviderId,
      compendiumProviderId: settings.compendiumProviderId,
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
    const { defaultProviderId, lightweightProviderId, compendiumProviderId, autoClassify, testProviderId } = body;

    const updates: Record<string, string> = {};
    if (defaultProviderId !== undefined) updates.defaultProviderId = defaultProviderId;
    if (lightweightProviderId !== undefined) updates.lightweightProviderId = lightweightProviderId;
    if (compendiumProviderId !== undefined) updates.compendiumProviderId = compendiumProviderId;
    if (autoClassify !== undefined) updates.autoClassify = String(autoClassify);

    if (Object.keys(updates).length > 0) {
      saveSettings(updates);
    }

    if (testProviderId) {
      try {
        const config = getProviderConfig(testProviderId);
        const providerInstance = new AIProvider(config);
        const result = await providerInstance.testConnection();
        return NextResponse.json({ ok: true, connectionTest: result });
      } catch (e) {
        return NextResponse.json({ ok: true, connectionTest: { ok: false, error: e instanceof Error ? e.message : String(e) } });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Save settings error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to save settings';
    return NextResponse.json({ error: msg, hint: 'If you see a native module error, run this app in Docker (docker compose up -d --build) instead of locally with npm.' }, { status: 500 });
  }
}