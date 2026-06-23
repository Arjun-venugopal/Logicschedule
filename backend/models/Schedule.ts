import { BaseModel } from './BaseModel';

class ScheduleModel extends BaseModel {
  constructor() {
    super('schedules');
  }
}

export default new ScheduleModel();
