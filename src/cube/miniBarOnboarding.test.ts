import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMiniBarTooltipSteps, describeNotationToken } from './miniBarOnboarding';
import { createSequenceTracker, evaluateSequenceMove } from './sequenceTracker';
import { createSolvedCube, applyMove, parseNotation } from './cubeLogic';
import { solveCubeWithMethod } from './methodSolver';

test('describeNotationToken explains clockwise, prime, double, slice, and cube rotations', () => {
  assert.match(describeNotationToken('R'), /Right face 90° clockwise/i);
  assert.match(describeNotationToken("U'"), /Top \(Up\) face 90° counter-clockwise/i);
  assert.match(describeNotationToken('F2'), /Front face 180°/i);
  assert.match(describeNotationToken('M'), /Middle slice/i);
  assert.match(describeNotationToken("y'"), /Rotate whole cube around Y-axis .*90° counter-clockwise/i);
});

test('buildMiniBarTooltipSteps starts with notation markers and adapts to Learn mode', () => {
  const tracker = createSequenceTracker(['R', 'U', "R'", "U'"]);
  const steps = buildMiniBarTooltipSteps({
    activeTab: 'learn',
    isLearnContext: true,
    lessonTitle: 'CFOP OLL: Sune',
    activeMethodPlan: null,
    tracker,
    playTrackerLabel: 'Sequence',
    isSolved: false,
  });

  assert.equal(steps.length, 3);
  assert.equal(steps[0].id, 'markers');
  assert.equal(steps[0].showMarkerLegend, true);
  assert.match(steps[0].exampleCallout ?? '', /Next \(R\)/);
  assert.equal(steps[1].id, 'context');
  assert.match(steps[1].body, /CFOP OLL: Sune/);
  assert.equal(steps[2].id, 'actions');
});

test('buildMiniBarTooltipSteps surfaces wrong-move recovery guidance when red marker is active', () => {
  const initial = createSequenceTracker(['R', 'U']);
  const wrongMove = parseNotation('L', '3x3')!;
  const afterWrong = evaluateSequenceMove(initial, wrongMove, '3x3');

  const steps = buildMiniBarTooltipSteps({
    activeTab: 'play',
    isLearnContext: false,
    activeMethodPlan: null,
    tracker: afterWrong,
    playTrackerLabel: 'Scramble',
    isSolved: false,
  });

  assert.match(steps[0].title, /Red Marker/i);
  assert.match(steps[0].body, /Undo/i);
  assert.match(steps[0].exampleCallout ?? '', /Expected R/i);
});

test('buildMiniBarTooltipSteps adapts to active multi-method solve plan', () => {
  let cube = createSolvedCube('3x3');
  for (const tok of ['R', 'U', "R'", 'F']) {
    cube = applyMove(cube, parseNotation(tok, '3x3')!);
  }
  const plan = solveCubeWithMethod(cube, 'cfop', '3x3');
  const tracker = createSequenceTracker(plan.allMoves.map((m) => m.notation));

  const steps = buildMiniBarTooltipSteps({
    activeTab: 'play',
    isLearnContext: false,
    activeMethodPlan: plan,
    tracker,
    playTrackerLabel: 'CFOP Solve',
    isSolved: false,
  });

  assert.match(steps[1].title, /CFOP/i);
  assert.match(steps[2].body, /Solve/i);
});
