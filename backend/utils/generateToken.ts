import jwt from 'jsonwebtoken';
import { config } from '../config/config';

const generateToken = (id: string, role: string) => {
  return jwt.sign({ id, role }, config.JWT_SECRET, {
    expiresIn: '30d',
  });
};

export default generateToken;
