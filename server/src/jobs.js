import crypto from 'node:crypto'

const jobs = new Map()
const TTL_MS = 60 * 60 * 1000
let tail = Promise.resolve()

export function createJob(type) {
  const job = { id: crypto.randomUUID(), type, status: 'queued', stage: 'queued', error: null, warning: null, track: null, createdAt: Date.now() }
  jobs.set(job.id, job)
  for (const [id, j] of jobs) if (Date.now() - j.createdAt > TTL_MS) jobs.delete(id)
  return job
}

export const getJob = (id) => jobs.get(id)

export function update(job, patch) {
  Object.assign(job, patch)
}

/** Runs jobs one at a time so a small server is never asked to convert two songs at once. */
export function enqueue(job, fn) {
  tail = tail.then(async () => {
    update(job, { status: 'running' })
    try {
      await fn(job)
      update(job, { status: 'done', stage: 'done' })
    } catch (err) {
      console.error(`[job ${job.id}]`, err)
      update(job, { status: 'error', error: err.userMessage || err.message || 'Something went wrong' })
    }
  })
}
