import {
  COLLAB_CLOUD_CAPABILITIES,
  COLLAB_CLOUD_JSON_OPERATIONS,
  collabControlOperationCodec,
  decodeResolveTicketNumber,
  decodeResolveTicketNumberResponse,
  type ResolveTicketNumberRequest,
  type ResolveTicketNumberResponse,
} from '../src/index';

describe('resolveTicketNumber', () => {
  it.each([1, 42, Number.MAX_SAFE_INTEGER])('decodes the exact Project and positive safe Ticket number %s', ticketNumber => {
    const request: ResolveTicketNumberRequest = { projectId: 'project_1', ticketNumber };
    expect(decodeResolveTicketNumber(request)).toEqual(request);
    expect(collabControlOperationCodec('resolveTicketNumber').decodeRequest(request))
      .toEqual({ status: 'ok', value: request });
  });

  it.each([
    { projectId: 'project_1', ticketNumber: 0 },
    { projectId: 'project_1', ticketNumber: -1 },
    { projectId: 'project_1', ticketNumber: 1.5 },
    { projectId: 'project_1', ticketNumber: Number.MAX_SAFE_INTEGER + 1 },
    { projectId: 'project_1', ticketNumber: Infinity },
    { projectId: 'project_1', ticketNumber: NaN },
    { projectId: 'project_1', ticketNumber: '42' },
    { projectId: 'project_1', ticketNumber: null },
    { projectId: 'project_1' },
    { projectId: 'invalid project', ticketNumber: 42 },
    { ticketNumber: 42 },
    { projectId: 'project_1', ticketNumber: 42, memberId: 'member_1' },
    null,
  ])('rejects malformed or extended number lookups %#', request => {
    expect(decodeResolveTicketNumber(request)).toBeNull();
    expect(collabControlOperationCodec('resolveTicketNumber').decodeRequest(request).status)
      .toBe('invalid');
  });

  it.each(['ticket_1', null])('decodes the exact resolved or missing Ticket ID %s', ticketId => {
    const response: ResolveTicketNumberResponse = { ticketId };
    expect(decodeResolveTicketNumberResponse(response)).toEqual(response);
    expect(collabControlOperationCodec('resolveTicketNumber').decodeResponse(response))
      .toEqual(response);
  });

  it.each([
    {},
    { ticketId: undefined },
    { ticketId: '' },
    { ticketId: 'invalid ticket' },
    { ticketId: 'x'.repeat(129) },
    { ticketId: 42 },
    { ticketId: null, futureField: true },
    null,
  ])('rejects malformed or extended lookup responses %#', response => {
    expect(() => decodeResolveTicketNumberResponse(response))
      .toThrow('collab.error.protocol-payload-invalid');
    expect(() => collabControlOperationCodec('resolveTicketNumber').decodeResponse(response))
      .toThrow('collab.error.protocol-payload-invalid');
  });

  it('uses the canonical Cloud JSON inventory and existing tickets capability', () => {
    expect(COLLAB_CLOUD_JSON_OPERATIONS).toContain('resolveTicketNumber');
    expect(COLLAB_CLOUD_CAPABILITIES).toContain('tickets');
  });
});
