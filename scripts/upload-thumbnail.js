#!/usr/bin/env node

const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');
const inquirer = require('inquirer');
const sharp = require('sharp');
const chalk = require('chalk');
require('dotenv').config();

const config = {
  spaces: {
    endpoint: process.env.DO_SPACES_ENDPOINT || 'nyc3.digitaloceanspaces.com',
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
    bucket: process.env.DO_SPACES_BUCKET,
    cdnUrl: process.env.DO_SPACES_CDN_URL
  },
  catalogPath: './catalog/catalog.json'
};

const spacesEndpoint = new AWS.Endpoint(config.spaces.endpoint);
const s3 = new AWS.S3({
  endpoint: spacesEndpoint,
  accessKeyId: config.spaces.accessKeyId,
  secretAccessKey: config.spaces.secretAccessKey
});

async function main() {
  if (!config.spaces.accessKeyId || !config.spaces.secretAccessKey || !config.spaces.bucket) {
    console.error(chalk.red('❌ Missing required environment variables: DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET'));
    process.exit(1);
  }

  const catalogData = await fs.readFile(config.catalogPath, 'utf8');
  const catalog = JSON.parse(catalogData);
  const ids = catalog.map(e => e.id);

  const { entryId, imagePath } = await inquirer.prompt([
    {
      type: 'list',
      name: 'entryId',
      message: 'Which catalog entry needs a thumbnail?',
      choices: ids
    },
    {
      type: 'input',
      name: 'imagePath',
      message: 'Path to thumbnail image:',
      validate: async (input) => {
        try { await fs.access(input); return true; }
        catch { return 'File not found'; }
      }
    }
  ]);

  const entry = catalog.find(e => e.id === entryId);
  const folderPath = `${entryId}/`;
  const tempThumb = path.join(__dirname, '../temp_thumbnail.jpg');

  console.log(chalk.blue('\nGenerating thumbnail...'));
  await sharp(imagePath)
    .resize(400, 400, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 85 })
    .toFile(tempThumb);
  console.log(chalk.green('✓ Thumbnail generated'));

  console.log(chalk.blue('Uploading...'));
  const fileContent = await fs.readFile(tempThumb);
  await s3.upload({
    Bucket: config.spaces.bucket,
    Key: `${folderPath}thumbnail.jpg`,
    Body: fileContent,
    ContentType: 'image/jpeg',
    ACL: 'public-read'
  }).promise();
  console.log(chalk.green(`✓ Uploaded to ${folderPath}thumbnail.jpg`));

  await fs.unlink(tempThumb);

  // Update the thumb URL in the catalog entry if it's not already .jpg
  const cdnBaseUrl = config.spaces.cdnUrl || `https://${config.spaces.bucket}.${config.spaces.endpoint}`;
  const expectedThumb = `${cdnBaseUrl}/${folderPath}thumbnail.jpg`;
  if (entry.thumb !== expectedThumb) {
    entry.thumb = expectedThumb;
    await fs.writeFile(config.catalogPath, JSON.stringify(catalog, null, 2));
    console.log(chalk.green('✓ Updated catalog.json thumb URL'));
  }

  console.log(chalk.green('\n🎉 Done!'));
}

main().catch(err => {
  console.error(chalk.red('❌ Error:', err.message));
  process.exit(1);
});
