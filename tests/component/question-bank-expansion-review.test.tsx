import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ManagedContentEditor } from '@/app/components/ManagedContentEditor';
import { prepareQuestionBank } from '../../scripts/question-bank-core';

const reads = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => path,
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  getDocs: reads.list,
  getDoc: reads.detail,
}));
vi.mock('@/lib/secure-api', () => ({ adminCatalogReadiness: async () => ({ approvedProblemCount: 0, cells: [] }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('filters supplied drafts and opens their protected details with the correct review controls', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const source = JSON.parse(readFileSync('docs/question-bank-expansion/MINDGUIDE_84_Question_Expansion.json','utf8'));
  const subset = new Set(['DM-01-B02','DM-01-I02','DM-02-B02','QM-07-B02']);
  const problems = source.problems.filter((p: {problem_id: string}) => subset.has(p.problem_id));
  const records = await prepareQuestionBank({...source, metadata:{...source.metadata, record_count:problems.length}, problems});
  const target = records.find(r => r.id === 'DM-01-B02')!;
  reads.list.mockResolvedValue({ docs: records.map(r => ({
    id: r.id, data: () => ({ ...r.problem, version: 1, status: r === target ? 'pending_validation' : 'draft' }),
  })) });
  reads.detail.mockImplementation(async (path: string) => {
    const record = records.find(r => path === 'problems/' + r.id + '/private/solution');
    if (!record) throw Error('Unexpected protected read: ' + path);
    const value: Record<string, unknown> = record.privateSolution;
    return { exists: () => true, data: () => value, get: (key: string) => value[key] };
  });
  render(<ManagedContentEditor collectionName="problems" />);
  await screen.findByText('Showing 4 of 4');
  fireEvent.click(screen.getByText('DM-01-I02 · v1 · draft'));
  expect(await screen.findByText('Submit for faculty validation')).toBeInTheDocument();
  for (const [key, value, count] of [
    ['Subject', target.problem.subject, 3], ['Topic', target.problem.topic, 2], ['Difficulty', 'Basic', 1],
  ] as const) {
    fireEvent.change(screen.getByLabelText(new RegExp(key + ' filter','i')), { target: {value} });
    expect(screen.getByText('Showing ' + count + ' of 4')).toBeInTheDocument();
  }
  fireEvent.click(screen.getByText(target.id + ' · v1 · pending_validation'));
  await waitFor(() => expect(screen.getByLabelText('Protected final answer')).toHaveValue(target.privateSolution.finalAnswer));
  expect(screen.getByLabelText('Protected worked steps')).toHaveValue(target.privateSolution.solutionSteps.join('\n'));
  expect(screen.getByText('Record external validation evidence')).toBeInTheDocument();
});
