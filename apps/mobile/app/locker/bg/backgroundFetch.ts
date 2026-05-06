import * as TaskManager from "expo-task-manager"
import * as BackgroundTask from "expo-background-task"

import { getRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { getToken } from "@/locker/auth/tokenStore"
import { checkForRemoteUpdates } from "./updateCheck"

const TASK_NAME = "LOCKER_REMOTE_CHECK"

// IMPORTANT: must be defined in the module/global scope.
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const vaultId = getRemoteVaultId()
    if (!vaultId) return BackgroundTask.BackgroundTaskResult.Success

    const token = await getToken()
    if (!token) return BackgroundTask.BackgroundTaskResult.Success

    // This should be a "light check" only (no decrypt/apply while locked)
    await checkForRemoteUpdates(vaultId, {
      mode: "background",
      source: "background_task",
    })

    // expo-background-task only supports Success/Failed (no NoData/NewData)
    return BackgroundTask.BackgroundTaskResult.Success
  } catch (err) {
    if (__DEV__) console.log("[bg] remote check failed", err)
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

export async function registerBackgroundTask(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync()
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      return
    }

    const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME)
    if (alreadyRegistered) return

    await BackgroundTask.registerTaskAsync(TASK_NAME, {
      // NOTE: minimumInterval is in MINUTES (not seconds)
      // Default is ~12 hours; minimum is 15 minutes.
      minimumInterval: 15,
    })
  } catch (err) {
    if (__DEV__) console.log("[bg] register failed", err)
  }
}

export async function unregisterBackgroundTask(): Promise<void> {
  try {
    await BackgroundTask.unregisterTaskAsync(TASK_NAME)
  } catch (err) {
    if (__DEV__) console.log("[bg] unregister failed", err)
  }
}

/**
 * DEV helper: triggers all registered background tasks in debug builds.
 */
export async function triggerBackgroundTaskForTesting(): Promise<boolean> {
  try {
    return await BackgroundTask.triggerTaskWorkerForTestingAsync()
  } catch (err) {
    if (__DEV__) console.log("[bg] trigger test failed", err)
    return false
  }
}
