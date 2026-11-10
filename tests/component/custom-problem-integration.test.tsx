import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { SecureTaskStart } from '@/app/components/SecureTaskStart';
import { clearViews } from '@/lib/view-cache';
import { VALIDATED_SUBJECTS, VALIDATED_TOPICS } from '@/data/validated-curriculum';
import type { Env } from '../../server/platform';
import type { Turn } from '../../server/gemini';
import { POST } from '../../app/api/learning/route';
import { MemoryStore } from '../helpers/memory-learning-store';
import { previewVerifiedProblem, startLearningSession, evaluatePhaseResponse } from '@/lib/secure-api';

vi.mock('@/lib/firebase', () => ({db:{},auth:{currentUser:{uid:'alice',getIdToken:async()=> 'test-token'}}}));
vi.mock('firebase/firestore', () => ({doc:vi.fn(),getDoc:vi.fn(async()=>({exists:()=>true,data:()=>({})}))}));
vi.mock('@/stores/auth-store', () => ({useAuthStore:()=>({firebaseUser:{uid:'alice'},userProfile:{displayName:'Learner'}})}));
vi.mock('@/app/components/StudentShell', () => ({StudentShell:({children}:{children:React.ReactNode})=><>{children}</>}));
// Only catalog/consent reads are stubbed. Preview/start/response use the real browser client.
vi.mock('@/lib/secure-api', async original => ({
  ...await original<typeof import('@/lib/secure-api')>(),
  getLearningCatalog:async()=>({subjects:VALIDATED_SUBJECTS,topics:VALIDATED_TOPICS,generatedAt:1}),
  getCurrentConsentNotice:async()=>({version:'notice'}),
}));
// External boundaries only: no Firebase SDK credentials or model calls.
vi.mock('../../server/auth', () => ({authenticate:async(request:Request)=>{
  expect(request.headers.get('Authorization')).toBe('Bearer test-token'); return 'alice';
}}));
vi.mock('../../server/config', () => ({getServerEnv:()=>env}));
vi.mock('../../server/firestore', () => ({Firestore:vi.fn(function(){return db;})}));
vi.mock('../../server/gemini', async original => ({
  ...await original<typeof import('../../server/gemini')>(),
  GeminiTutor:class { generate(context:unknown){return generate(context);} },
}));
let db:MemoryStore, env:Env, generate:ReturnType<typeof vi.fn>;
let requests:Array<{operation:string;input:any}>;
let started:any;
const turn:Turn={feedback:'Identify the given information.',question:'What does the problem ask you to find?',accepted:false,confidence:'high',category:'none',evidence:[],intent:'answer',leaksSolution:false};
beforeEach(()=>{
  clearViews();sessionStorage.clear();requests=[];started=undefined;db=new MemoryStore();
  generate=vi.fn().mockResolvedValue(turn);
  env={AI_ENABLED:'true',AI_FREE_TIER_CONFIRMED:'true',GEMINI_MODEL:'test-only',GEMINI_RPM:'100',GEMINI_TPM:'10000000',GEMINI_RPD:'1000'} as Env;
  db.put('users/alice',{status:'active'});db.put('system_settings/privacy',{currentConsentVersion:'notice'});
  db.put('policy_documents/notice',{status:'active',aiProcessingVersion:'gemini-free-v1'});db.put('users/alice/consents/notice',{version:'notice'});
  db.put('system_settings/pilot',{state:'open',enabledTopicIds:VALIDATED_TOPICS.map(t=>t.id)});db.put('pilot_roster/alice',{status:'admitted'});
  for(const subject of VALIDATED_SUBJECTS) db.put(`subjects/${subject.id}`,{...subject,status:'approved'});
  for(const topic of VALIDATED_TOPICS) db.put(`topics/${topic.id}`,{...topic,status:'approved'});
  vi.stubGlobal('fetch',vi.fn(async (url,init)=>{
    expect(url).toBe('/api/learning'); expect(init.headers.Authorization).toBe('Bearer test-token');
    const request=JSON.parse(init.body);requests.push(request);
    const response=await POST(new Request('http://localhost/api/learning',init));
    if(request.operation==='startLearningSession' && response.ok) started=(await response.clone().json()).session;
    return response;
  }));
});
afterEach(()=>{cleanup();clearViews();vi.unstubAllGlobals();});
async function enter(topic:string,question:string,latex?:string) {
  render(<MemoryRouter><Routes><Route path='/' element={<SecureTaskStart/>}/><Route path='/session/:id/learn' element={<p>Existing session destination</p>}/></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'My own problem'}));
  if(topic.startsWith('discrete-')) fireEvent.click(screen.getByRole('button',{name:/Discrete Mathematics/}));
  fireEvent.change(screen.getByRole('combobox',{name:/Validated topic/}),{target:{value:topic}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:question}});
  if(latex){const field=screen.getByLabelText('Mathematical expression editor') as HTMLElement & {value:string};field.value=latex;fireEvent.input(field);}
  fireEvent.click(screen.getByRole('button',{name:'Validate and start'}));
}
describe('custom input UI → real client → in-memory secure service acceptance',()=>{
  it.each([
    ['quantitative-methods-functions','Given f(x) = 2x + 3, find f(5).','13',undefined],
    ['quantitative-methods-functions','Given f(x) = [math], find f(3).','11','x^{2}+\\frac{2x}{3}'],
    ['quantitative-methods-descriptive-statistics','sample variance: 2, 4, 6','4',undefined],
    ['discrete-mathematics-combinatorics','combination: 8, 3','56',undefined],
  ])('accepts %s: %s',async(topic,question,answer,latex)=>{
    await enter(topic,question,latex);
    expect(await screen.findByText('Existing session destination')).toBeVisible();
    expect(requests.map(r=>r.operation)).toEqual(['previewVerifiedProblem','startLearningSession']);
    expect(requests[1].input).toMatchObject({question,topicId:topic,requestedDifficulty:'Basic'});
    if(latex) expect(requests[1].input.questionLatex).toBe(latex);
    expect(started.currentPhase).toBe('problem_understanding');expect(started.releasedSolution).toBeNull();
    expect(generate.mock.calls[0][0].reference.finalAnswer).toBe(answer);
    expect((await db.get(`sessions/${started.id}/private/reference`)).data.finalAnswer).toBe(answer);
    expect(started).not.toHaveProperty('finalAnswer');
  });
  it.each([
    ['mean: 4, 8, 12','does not match'],
    ['Find the derivative of f(x)=x^2','Unsupported'],
    ['Given f(x) = 2x +, find f(5).','Malformed'],
  ])('rejects %s before creating a session',async(question,message)=>{
    await enter('quantitative-methods-functions',question);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(requests.map(r=>r.operation)).toEqual(['previewVerifiedProblem']);
    expect(await db.query('sessions')).toHaveLength(0);expect(generate).not.toHaveBeenCalled();
  });
  it('rejects modified input with an old confirmation through the real client',async()=>{
    const input={topicId:'quantitative-methods-functions',question:'Given f(x) = x+1, find f(2).',requestedDifficulty:'Basic' as const};
    const preview=await previewVerifiedProblem(input);
    await expect(startLearningSession({...input,mode:'free_form',question:'Given f(x) = x+2, find f(2).',confirmationHash:preview.confirmationHash})).rejects.toThrow('Confirm');
    expect(await db.query('sessions')).toHaveLength(0);
  });
  it('keeps wrong computation in the existing stage and returns corrective guidance',async()=>{
    await enter('quantitative-methods-functions','Given f(x) = 2x+3, find f(5).');
    await screen.findByText('Existing session destination');
    generate.mockResolvedValue({...turn,accepted:true,evidence:['The learner identifies the requested value and justifies substitution.']});
    for(let i=0;i<2;i++) {
      const result=await evaluatePhaseResponse({sessionId:started.id,revision:started.revision,expectedPhase:started.currentPhase,response:{plainText:'Substitute the given input into the function rule and respect operation order.'}});
      started=result.session;
    }
    expect(started.currentPhase).toBe('guided_computation_or_proof');
    const result=await evaluatePhaseResponse({sessionId:started.id,revision:started.revision,expectedPhase:started.currentPhase,response:{plainText:'999'}});
    expect(result.session.currentPhase).toBe('guided_computation_or_proof');
    expect(result.diagnosis?.category).toBe('computational_error');
    expect(result.session.releasedSolution).toBeNull();expect(result.tutorMessage?.text).not.toContain('13');
  });
  it('preserves the prepared-problem path from the UI',async()=>{
    const topicId='quantitative-methods-functions';
    db.put('problems/prepared',{topicId,status:'approved',difficulty:'Basic',version:1,validationRecordId:'approval',problemText:'Given f(x) = 2x+3, find f(5).'});
    db.put('content_validation_records/approval',{decision:'approved',problemId:'prepared',problemVersion:1});
    db.put('problem_scoring/prepared',{problemVersion:1,validationRecordId:'approval',expectedConcepts:['evaluation'],solutionSteps:['Substitute x.'],finalAnswer:'13',interpretation:'The function value.',answerSpecification:{kind:'number',value:13}});
    render(<MemoryRouter><SecureTaskStart/></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button',{name:'Assign my prepared problem'}));
    await waitFor(()=>expect(started?.problemId).toBe('prepared'));
    expect(requests.map(r=>r.operation)).toEqual(['startLearningSession']);
  });
});
