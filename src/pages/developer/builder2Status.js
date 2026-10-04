export function runtimeMessageTone(message) {
  if (/^(Test|Debug):\s*(FAILED|ERROR)\b/i.test(message)) return 'error';
  if (/^(Test|Debug):\s*(NOT_STARTED|SKIPPED|WAITING|QUEUED|RUNNING|STOPPED)\b/i.test(message)) return 'warning';
  return 'success';
}
