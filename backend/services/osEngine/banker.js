/**
 * Banker's Algorithm safety check over the PostgreSQL `resources` pool.
 */
export function checkBankersSafety({ available, allocations = {}, maxNeeds = {}, request = {}, requesterId }) {
  const work = { ...available };
  const resourceIds = new Set([
    ...Object.keys(work),
    ...Object.keys(request)
  ]);

  // 1. Check request <= available
  for (const r of resourceIds) {
    const reqQty = Number(request[r] || 0);
    if (reqQty < 0) {
      return { safe: false, reason: `insufficient_resource: negative request for ${r}` };
    }
    if (reqQty > Number(work[r] || 0)) {
      return {
        safe: false,
        reason: `insufficient_resource: requested ${reqQty} ${r}, available ${Number(work[r] || 0)}`
      };
    }
  }

  // 2. Tentative allocation state
  const procs = new Set([...Object.keys(allocations), ...Object.keys(maxNeeds)]);
  if (requesterId) procs.add(requesterId);

  const alloc = {};
  const need = {};
  for (const p of procs) {
    alloc[p] = { ...(allocations[p] || {}) };
    const maxP = maxNeeds[p] || {};
    need[p] = {};
    for (const r of resourceIds) {
      const a = Number(alloc[p][r] || 0);
      const m = Number(maxP[r] ?? a);
      need[p][r] = Math.max(0, m - a);
    }
  }

  if (requesterId) {
    for (const r of resourceIds) {
      const reqQty = Number(request[r] || 0);
      if (reqQty === 0) continue;
      work[r] = Number(work[r] || 0) - reqQty;
      alloc[requesterId][r] = Number(alloc[requesterId][r] || 0) + reqQty;
      const maxR = Number((maxNeeds[requesterId] && maxNeeds[requesterId][r]) ?? alloc[requesterId][r]);
      need[requesterId][r] = Math.max(0, maxR - alloc[requesterId][r]);
    }
  }

  // 3. Safety sequence search
  const finish = {};
  for (const p of procs) finish[p] = false;
  const sequence = [];

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const p of procs) {
      if (finish[p]) continue;
      let canRun = true;
      for (const r of resourceIds) {
        if (Number(need[p][r] || 0) > Number(work[r] || 0)) {
          canRun = false;
          break;
        }
      }
      if (canRun) {
        for (const r of resourceIds) {
          work[r] = Number(work[r] || 0) + Number(alloc[p][r] || 0);
        }
        finish[p] = true;
        sequence.push(p);
        progressed = true;
      }
    }
  }

  const allFinished = [...procs].every((p) => finish[p]);
  if (!allFinished) {
    return {
      safe: false,
      reason: 'insufficient_resource: unsafe state detected by Banker safety check'
    };
  }
  return { safe: true, sequence };
}
