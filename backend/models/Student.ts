import { BaseModel } from './BaseModel';

class StudentModel extends BaseModel {
  constructor() {
    super('students');
  }
}

export default new StudentModel();
