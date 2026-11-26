import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { OperationsDigestService } from '@gitroom/nestjs-libraries/services/operations-digest.service';

/**
 * Wrapper Temporal do resumo operacional. A logica vive no service da library
 * (`OperationsDigestService`) — a activity so a expoe para o workflow, conforme
 * a regra de ouro do orchestrator.
 */
@Injectable()
@Activity()
export class OperationsDigestActivity {
  constructor(private _operationsDigestService: OperationsDigestService) {}

  @ActivityMethod()
  async sendOperationsDigest() {
    return this._operationsDigestService.sendDigests();
  }
}
