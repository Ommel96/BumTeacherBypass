export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { listLernziele, addLernziele, deleteLernziel, updateLernziel, listModulesWithLernziele } from '@/lib/lernziele-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('modules') === '1') {
      return NextResponse.json({ modules: listModulesWithLernziele() });
    }
    const moduleNumber = searchParams.get('module_number') || undefined;
    return NextResponse.json({ lernziele: listLernziele(moduleNumber) });
  } catch (error) {
    console.error('List lernziele error:', error);
    return NextResponse.json({ error: 'Lernziele konnten nicht geladen werden' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const moduleNumber = String(body?.module_number || '').trim();
    const goals = Array.isArray(body?.goals) ? body.goals.map(String) : [];
    if (!moduleNumber) return NextResponse.json({ error: 'module_number fehlt' }, { status: 400 });
    if (goals.length === 0) return NextResponse.json({ error: 'Keine Lernziele angegeben' }, { status: 400 });
    const added = addLernziele(moduleNumber, goals, body?.source === 'upload' ? 'upload' : 'manual');
    return NextResponse.json({ added });
  } catch (error) {
    console.error('Add lernziele error:', error);
    return NextResponse.json({ error: 'Lernziele konnten nicht gespeichert werden' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.id || typeof body?.goal !== 'string' || !body.goal.trim()) {
      return NextResponse.json({ error: 'id und goal erforderlich' }, { status: 400 });
    }
    updateLernziel(body.id, body.goal);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Update lernziel error:', error);
    return NextResponse.json({ error: 'Lernziel konnte nicht aktualisiert werden' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });
    deleteLernziel(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Delete lernziel error:', error);
    return NextResponse.json({ error: 'Lernziel konnte nicht gelöscht werden' }, { status: 500 });
  }
}
