import {test} from 'node:test';
import assert from 'node:assert/strict';
import {beerShareSummary} from './beer-share.js';
test('first customer can share a zero score and zero spill before final result',()=>{
 const s=beerShareSummary({phase:'tasting',order:{name:'첫 잔'},roundResult:{round:0,score:0,spilled:0,spillPenalty:0}});
 assert.equal(s.score,0);assert.equal(s.spilledMl,0);assert.equal(s.penalty,0);assert.match(s.text,/손님 1/);assert.match(s.text,/흘린 맥주 0mL/);
});
test('final share totals all three rounds and labels average separately',()=>{
 const s=beerShareSummary({phase:'result',result:{value:42,rounds:[{spilled:.1,spillPenalty:10},{spilled:.2,spillPenalty:20},{spilled:.4,spillPenalty:40}]}});
 assert.equal(s.score,42);assert.equal(s.spilledMl,350);assert.equal(s.penalty,70);assert.match(s.text,/평균 42점/);assert.match(s.text,/누적 넘침 감점 −70점/);
});
test('unfinished round has no shareable result',()=>assert.equal(beerShareSummary({phase:'ready'}),null));
