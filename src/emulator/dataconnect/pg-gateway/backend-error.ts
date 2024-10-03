import { BufferWriter } from './buffer-writer';
import { BackendMessageCode } from './message-codes';

export interface BackendError {
  severity: 'ERROR' | 'FATAL' | 'PANIC';
  code: string;
  message: string;
  detail?: string;
  hint?: string;
  position?: string;
  internalPosition?: string;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;
  file?: string;
  line?: string;
  routine?: string;
}

/**
 * Creates a backend error message
 *
 * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-ERRORRESPONSE
 *
 * For error fields, @see https://www.postgresql.org/docs/current/protocol-error-fields.html#PROTOCOL-ERROR-FIELDS
 */
export function createBackendErrorMessage(error: BackendError) {
  const writer = new BufferWriter();

  writer.addString('S');
  writer.addCString(error.severity);

  writer.addString('V');
  writer.addCString(error.severity);

  writer.addString('C');
  writer.addCString(error.code);

  writer.addString('M');
  writer.addCString(error.message);

  if (error.detail !== undefined) {
    writer.addString('D');
    writer.addCString(error.detail);
  }

  if (error.hint !== undefined) {
    writer.addString('H');
    writer.addCString(error.hint);
  }

  if (error.position !== undefined) {
    writer.addString('P');
    writer.addCString(error.position);
  }

  if (error.internalPosition !== undefined) {
    writer.addString('p');
    writer.addCString(error.internalPosition);
  }

  if (error.internalQuery !== undefined) {
    writer.addString('q');
    writer.addCString(error.internalQuery);
  }

  if (error.where !== undefined) {
    writer.addString('W');
    writer.addCString(error.where);
  }

  if (error.schema !== undefined) {
    writer.addString('s');
    writer.addCString(error.schema);
  }

  if (error.table !== undefined) {
    writer.addString('t');
    writer.addCString(error.table);
  }

  if (error.column !== undefined) {
    writer.addString('c');
    writer.addCString(error.column);
  }

  if (error.dataType !== undefined) {
    writer.addString('d');
    writer.addCString(error.dataType);
  }

  if (error.constraint !== undefined) {
    writer.addString('n');
    writer.addCString(error.constraint);
  }

  if (error.file !== undefined) {
    writer.addString('F');
    writer.addCString(error.file);
  }

  if (error.line !== undefined) {
    writer.addString('L');
    writer.addCString(error.line);
  }

  if (error.routine !== undefined) {
    writer.addString('R');
    writer.addCString(error.routine);
  }

  // Add null byte to the end
  writer.addCString('');

  return writer.flush(BackendMessageCode.ErrorMessage);
}
