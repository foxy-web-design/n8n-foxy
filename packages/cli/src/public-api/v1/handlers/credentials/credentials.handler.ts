/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type express from 'express';

import { CredentialsHelper } from '@/credentials-helper';
import { CredentialTypes } from '@/credential-types';
import type { CredentialsEntity } from '@/databases/entities/credentials-entity';
import type { CredentialTypeRequest, CredentialRequest } from '../../../types';
import { projectScope } from '../../shared/middlewares/global.middleware';
import { validCredentialsProperties, validCredentialType } from './credentials.middleware';

import {
	createCredential,
	encryptCredential,
	getCredentials,
	getSharedCredentials,
	removeCredential,
	sanitizeCredentials,
	saveCredential,
	toJsonSchema,
} from './credentials.service';
import { Container } from 'typedi';
import { z } from 'zod';
import { EnterpriseCredentialsService } from '@/credentials/credentials.service.ee';

export = {
	createCredential: [
		validCredentialType,
		validCredentialsProperties,
		async (
			req: CredentialRequest.Create,
			res: express.Response,
		): Promise<express.Response<Partial<CredentialsEntity>>> => {
			try {
				const newCredential = await createCredential(req.body);

				const encryptedData = await encryptCredential(newCredential);

				Object.assign(newCredential, encryptedData);

				const savedCredential = await saveCredential(newCredential, req.user, encryptedData);

				return res.json(sanitizeCredentials(savedCredential));
			} catch ({ message, httpStatusCode }) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				return res.status(httpStatusCode ?? 500).json({ message });
			}
		},
	],
	transferCredential: [
		projectScope('credential:move', 'credential'),
		async (req: CredentialRequest.Transfer, res: express.Response) => {
			const body = z.object({ destinationProjectId: z.string() }).parse(req.body);

			await Container.get(EnterpriseCredentialsService).transferOne(
				req.user,
				req.params.workflowId,
				body.destinationProjectId,
			);

			res.status(204).send();
		},
	],
	deleteCredential: [
		projectScope('credential:delete', 'credential'),
		async (
			req: CredentialRequest.Delete,
			res: express.Response,
		): Promise<express.Response<Partial<CredentialsEntity>>> => {
			const { id: credentialId } = req.params;
			let credential: CredentialsEntity | undefined;

			if (!['global:owner', 'global:admin'].includes(req.user.role)) {
				const shared = await getSharedCredentials(req.user.id, credentialId);

				if (shared?.role === 'credential:owner') {
					credential = shared.credentials;
				}
			} else {
				credential = (await getCredentials(credentialId)) as CredentialsEntity;
			}

			if (!credential) {
				return res.status(404).json({ message: 'Not Found' });
			}

			await removeCredential(req.user, credential);
			return res.json(sanitizeCredentials(credential));
		},
	],

	getCredentialType: [
		async (req: CredentialTypeRequest.Get, res: express.Response): Promise<express.Response> => {
			const { credentialTypeName } = req.params;

			try {
				Container.get(CredentialTypes).getByName(credentialTypeName);
			} catch (error) {
				return res.status(404).json({ message: 'Not Found' });
			}

			const schema = Container.get(CredentialsHelper)
				.getCredentialsProperties(credentialTypeName)
				.filter((property) => property.type !== 'hidden');

			return res.json(toJsonSchema(schema));
		},
	],
};
