import { BaseModel } from './BaseModel';

class BatchModel extends BaseModel {
  constructor() {
    super('batches');
  }
}

export default new BatchModel();
