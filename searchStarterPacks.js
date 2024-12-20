import express from 'express';
import { BskyAgent } from '@atproto/api';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function uriToUrl(uri, handle) {
    if (!uri.startsWith('at://')) return null;
    const parts = uri.replace('at://', '').split('/');
    const rkey = parts[2];
    return `https://bsky.app/starter-pack/${handle}/${rkey}`;
}

function cleanForCSV(text) {
    if (!text) return '';
    return text.replace(/[\n\r,]/g, ' ').trim();
}

app.post('/search', async (req, res) => {
    const { handle, password, searchTerm } = req.body;
    const limit = pLimit(5);
    let allPacksData = [];

    try {
        const agent = new BskyAgent({
            service: 'https://bsky.social'
        });

        console.log('Connecting to Bluesky...');
        await agent.login({
            identifier: handle,
            password: password
        });

        const searchResponse = await agent.api.app.bsky.actor.searchActorsTypeahead({
            term: searchTerm,
            limit: 100
        });

        if (searchResponse.data.actors) {
            const actors = searchResponse.data.actors;
            console.log(`Found ${actors.length} users for "${searchTerm}"`);

            const fetchPromises = actors.map(actor => limit(async () => {
                try {
                    let allStarterPacks = [];
                    let cursor = null;

                    do {
                        const packsResponse = await agent.api.app.bsky.graph.getActorStarterPacks({
                            actor: actor.handle,
                            limit: 100,
                            cursor: cursor
                        });

                        if (packsResponse.data.starterPacks) {
                            allStarterPacks = allStarterPacks.concat(packsResponse.data.starterPacks);
                            cursor = packsResponse.data.cursor;
                        } else {
                            cursor = null;
                        }
                    } while (cursor);

                    return allStarterPacks.map(pack => ({
                        name: cleanForCSV(pack.record?.name || 'No Name'),
                        description: cleanForCSV(pack.record?.description || 'No Description'),
                        url: uriToUrl(pack.uri, actor.handle) || 'Invalid URI',
                        owner: actor.handle,
                        itemCount: pack.listItemCount || 0,
                        totalJoins: pack.joinedAllTimeCount || 0
                    }));
                } catch (error) {
                    console.error(`Error fetching packs for ${actor.handle}:`, error.message);
                    return [];
                }
            }));

            const results = await Promise.all(fetchPromises);
            allPacksData = results.flat();
            
            res.json(allPacksData);
        } else {
            res.json([]);
        }

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: error.message,
            status: error.status,
            details: error.response?.data 
        });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});