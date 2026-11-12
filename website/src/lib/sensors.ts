import { api } from './api';
import type { Sensor } from './types';

export const loadSensors = async () => (await api<{ sensors: Sensor[] }>('/sensors')).sensors;