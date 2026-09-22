import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDemand, defaultPlan, useCases } from '../shared/opportunity.js';
import { segments } from '../shared/types.js';

test('demand calculator uses quantities and supply share without inventing purchase intent',()=>{
  const café=defaultPlan('Cafés');
  const result=calculateDemand('Cafés',{...café,dailyLow:80,dailyHigh:120,days:25,portion:2,supplyShare:50});
  assert.equal(result.low,2000);assert.equal(result.high,3000);assert.equal(result.unit,'sachets');
  assert.equal(calculateDemand('Cafés',{...café,supplyShare:0}).high,0);
  assert.equal(calculateDemand('Cafés',{...café,dailyLow:0}).low,0);
});
test('recipe grams and liquid millilitres convert to kg and litres independently',()=>{
  const bakery=calculateDemand('Bakeries',{...defaultPlan('Bakeries'),dailyLow:2,dailyHigh:4,days:20,portion:750});
  assert.equal(bakery.low,30);assert.equal(bakery.high,60);assert.equal(bakery.unit,'kg');
  const bar=calculateDemand('Bars & lounges',{...defaultPlan('Bars & lounges'),dailyLow:20,dailyHigh:40,days:30,portion:25});
  assert.equal(bar.low,15);assert.equal(bar.high,30);assert.equal(bar.unit,'litres');
});
test('all buyer categories have valid scenarios and unrelated uses are rejected',()=>{
  for(const segment of segments){const plan=defaultPlan(segment);const result=calculateDemand(segment,plan);assert.ok(result.high>=result.low);assert.ok(useCases(segment).some(c=>c.id===plan.useCaseId));}
  assert.throws(()=>calculateDemand('Bakeries',defaultPlan('Bars & lounges')),/buyer category/);
});
