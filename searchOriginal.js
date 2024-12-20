import { BskyAgent } from '@atproto/api';
import dotenv from 'dotenv';
import fs from 'fs';
import pLimit from 'p-limit';

dotenv.config();

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

async function searchAndGetStarterPacks(query = 'technology') {
    let allPacksData = [];
    // Create a rate limiter that allows 5 concurrent requests
    const limit = pLimit(5);

    try {
        const agent = new BskyAgent({
            service: 'https://bsky.social'
        });

        console.log('Connecting to Bluesky...');
        await agent.login({
            identifier: process.env.BLUESKY_HANDLE,
            password: process.env.BLUESKY_PASSWORD
        });

        const searchResponse = await agent.api.app.bsky.actor.searchActorsTypeahead({
            term: query,
            limit: 100
        });

        if (searchResponse.data.actors) {
            const actors = searchResponse.data.actors;
            console.log(`Found ${actors.length} users for "${query}"`);

            // Create an array of promises for fetching starter packs
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

            // Process all promises in parallel with rate limiting
            const results = await Promise.all(fetchPromises);
            
            // Flatten results array and add to allPacksData
            allPacksData = results.flat();

            // Write to CSV file
            if (allPacksData.length > 0) {
                const csvHeader = 'Name,Description,URL,Owner,Item Count,Total Joins\n';
                const csvRows = allPacksData.map(pack => 
                    `${pack.name},${pack.description},${pack.url},${pack.owner},${pack.itemCount},${pack.totalJoins}`
                ).join('\n');

                const filename = `starter_packs_${query}_${new Date().toISOString().split('T')[0]}.csv`;
                fs.writeFileSync(filename, csvHeader + csvRows);
                console.log(`\nSaved ${allPacksData.length} starter packs to ${filename}`);
            } else {
                console.log('\nNo starter packs found to save');
            }
        }

    } catch (error) {
        console.error('Error:', {
            message: error.message,
            status: error.status,
            data: error.data,
            details: error.response?.data
        });
    }
}

// Execute search
searchAndGetStarterPacks('s');