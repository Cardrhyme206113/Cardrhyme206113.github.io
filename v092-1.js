window.__v091=window.__v091.then(s=>{s=s.replaceAll('0.9.1','0.9.2');s=s.replace(`    const chosen=chooseDirections(
      pattern,
      previous,
      \`\${seed}|\${config.id}|\${cluster}|\${i}\`,
      time,
      boundaryTargets
    );`,`    const expectedLeftDirection=previous.left
      ?oppositeDirection(previous.left.direction)
      :null;
    const expectedRightDirection=previous.right
      ?oppositeDirection(previous.right.direction)
      :null;
    const chosen=chooseDirections(
      pattern,
      previous,
      \`\${seed}|\${config.id}|\${cluster}|\${i}\`,
      time,
      boundaryTargets
    );
    if(expectedLeftDirection&&chosen.leftDirection!==expectedLeftDirection)failedRotations++;
    if(expectedRightDirection&&chosen.rightDirection!==expectedRightDirection)failedRotations++;`);return s;});