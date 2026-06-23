import { BaseModel } from './BaseModel';

class TeacherModel extends BaseModel {
  constructor() {
    super('teachers');
  }
}

export default new TeacherModel();
