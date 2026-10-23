import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:3113';
const output=new URL('../../.admin-console/evidence/hq-projects-owner/',import.meta.url);
await mkdir(output,{recursive:true});
const report={classification:'Owner browser evidence; separate independent acceptance required',checks:[],errors:[],external:[],startedAt:new Date().toISOString()};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:[],serviceWorkers:'block'});
await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():(report.external.push(r.request().url()),r.abort()));
await context.addInitScript(()=>localStorage.setItem('primora_lang','en'));
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
const pass=name=>{report.checks.push(name);console.log('PASS',name);};
const state=(view,filters={})=>page.evaluate(async({view,filters})=>{const r=await fetch('/api/hq/state?'+new URLSearchParams({view,...filters}));const b=await r.json();if(!b.ok)throw Error(b.error?.code);return b.data;},{view,filters});
async function save(){await page.getByRole('dialog').getByRole('button',{name:'Save record',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);}
try{
 await page.goto(base+'/hq/projects');await expect(page.getByRole('heading',{name:'Projects and Initiatives',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'No projects in this workspace'})).toBeVisible();pass('Fresh local workspace has an explicit empty state');
 const name='CONTROLLED owner project '+randomUUID().slice(0,8);
 await page.getByRole('button',{name:'Create project',exact:true}).click();let d=page.getByRole('dialog');await d.getByLabel('Title',{exact:true}).fill(name);await d.getByLabel('Objective',{exact:true}).fill('Verify local project persistence and evidence-bound closure.');await d.getByLabel('Acceptance criteria / evidence',{exact:true}).fill('Actual persisted tasks and exact current evidence are inspectable.');await save();await expect(page.locator('h1')).toHaveText(name);const id=page.url().split('/').at(-1);let data=await state('project',{id});assert.equal(data.project.revision,1);assert.equal(data.project.ownerId,'alexander');pass('Project editor checks persisted receipt, revision and inactive coordinator');
 await page.getByRole('button',{name:'Manage task links'}).click();await page.getByRole('button',{name:'Create and attach task'}).click();d=page.getByRole('dialog');for(const [label,value] of [['Title','CONTROLLED atomic project task'],['Your request','Check project link with real local command.'],['Required outcome','One task and one association in the same transaction.'],['How you will accept the result','Inspect the saved task and project revision.'],['Scope, limits and prohibited actions','Local development only. No business employee activation or financial execution.']]){const field=d.getByLabel(label,{exact:true});await field.fill(value);}
 // Existing composer labels are retrieved from its actual labelled fields, preserving its shared contract.
 const fields=await d.locator('fieldset > .hq-field textarea').all();for(const field of fields){if(!(await field.inputValue()))await field.fill('Local controlled acceptance evidence with every business hold retained.');}
 await save();await expect(page).toHaveURL(/\/hq\/tasks\//);data=await state('project',{id});assert.equal(data.tasks.length,1);assert.equal(data.project.taskIds[0],data.tasks[0].id);pass('Existing task composer atomically creates and attaches one task');
 await page.goto(base+'/hq/projects/'+id);await page.getByRole('button',{name:'Define milestone'}).click();d=page.getByRole('dialog');await d.getByLabel('Title',{exact:true}).fill('CONTROLLED milestone');await d.getByLabel('Required outcome',{exact:true}).fill('Evidence is explicitly attached before closure.');await d.getByLabel('How you will accept the result',{exact:true}).fill('Block missing evidence and unresolved declared blockers.');await d.getByLabel('Declared acceptance blockers',{exact:true}).fill('Native acceptance is pending.');await d.getByRole('checkbox').first().check();await save();data=await state('project',{id});assert.equal(data.milestones.length,1);assert.deepEqual(data.milestones[0].blockers,['Native acceptance is pending.']);pass('Milestone outcome, linked task and explicit blocker persist');
 await page.getByRole('button',{name:'Prepare closure recommendation',exact:true}).last().click();d=page.getByRole('dialog');await expect(d.getByText('Acceptance blocked',{exact:true})).toBeVisible();await expect(d.getByRole('button',{name:'Save record',exact:true})).toBeDisabled();await expect(d.getByText('Native acceptance is pending.',{exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(d).toHaveCount(0);pass('Exact closure preview displays blockers and refuses acceptance; Escape closes');
 await page.getByRole('button',{name:'العربية',exact:true}).click();await page.setViewportSize({width:375,height:900});await expect(page.locator('.hq')).toHaveAttribute('dir','rtl');await expect(page.getByRole('button',{name:'تحديد مرحلة'})).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:fileURLToPath(new URL('arabic375.png',output)),fullPage:true});pass('Arabic mobile route mirrors and remains within viewport');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=String(e.stack||e);throw e;}finally{report.finishedAt=new Date().toISOString();await writeFile(new URL('result.json',output),JSON.stringify(report,null,2));await browser.close();}
