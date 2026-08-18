export enum EmergencyCallExecutionStatus {
  Idle = 'idle',
  Pending = 'pending',
  WaitingForConnectivity = 'waiting_for_connectivity',
  ReadyToExecute = 'ready_to_execute',
  Executing = 'executing',
  Failed = 'failed',
  Completed = 'completed',
}