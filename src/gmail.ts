
import { authenticate } from '@google-cloud/local-auth';
import { promises as fs } from 'fs';
import { google } from 'googleapis';
import { simpleParser } from 'mailparser';
import path from 'path';
import process from 'process';

var Gmail = require('node-gmail-api')

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function getAccessTokenFromSavedCredentialsIfExist(): Promise<string | null> {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content.toString());
        const client = google.auth.fromJSON(credentials);
        const accessToken = await client.getAccessToken();
        return accessToken.token;
    } catch (err) {
        return null;
    }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content.toString());
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
export async function authorize(): Promise<string> {
    let accessToken = await getAccessTokenFromSavedCredentialsIfExist();
    if (accessToken) {
        console.log("access token", accessToken);

        return accessToken;
    }

    const client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });

    if (client.credentials) {
        await saveCredentials(client);
    }

    accessToken = (await client.getAccessToken()).token;
    console.log("access token", accessToken);

    return accessToken;
}

export async function getMessages(accessToken: string): Promise<any[]> {
    let gmail = new Gmail(accessToken)
    let messagesStream = gmail.messages('from:info@mail-pokemon-cafe.jp', { max: 10 });

    let messages = []

    await simpleParser(messagesStream);

    return new Promise((resolve, reject) => {
        messagesStream.on('end', function () {
            resolve(messages)
        });
    });
}

