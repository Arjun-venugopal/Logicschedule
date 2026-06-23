import { BaseModel } from './BaseModel';

class DemoSessionModel extends BaseModel {
  constructor() {
    super('demos');
  }
}

export default new DemoSessionModel();
