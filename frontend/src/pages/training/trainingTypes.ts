export const TRAINING_TYPES = [
  { value: 'inspection_training', label: 'Inspection Training', color: 'cyan' },
  { value: 'job_training', label: 'Job Training', color: 'purple' },
  { value: 'induction_training', label: 'Induction Training', color: 'green' },
  { value: 'safety_training', label: 'Safety Training', color: 'red' },
  { value: 'toolbox_training', label: 'Toolbox Training', color: 'blue' },
] as const;

export type TrainingTypeValue = typeof TRAINING_TYPES[number]['value'];

export const DEFAULT_TRAINING_TYPE: TrainingTypeValue = 'inspection_training';

export const getTrainingTypeMeta = (type?: string) => (
  TRAINING_TYPES.find(item => item.value === type) || {
    value: type || 'unknown',
    label: type ? type.replace(/_/g, ' ') : 'Unknown',
    color: 'default',
  }
);
