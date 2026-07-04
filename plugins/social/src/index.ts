import { PluginManifest } from '../../shared/plugin-manifest.interface';
export { SocialModule } from './social.module';
export { SocialService } from './social.service';
export { SocialController } from './social.controller';

export const manifest: PluginManifest = {
  id: 'social',
  version: '1.0.0',
  name: 'Social Feed',
  description: 'Community social layer: posts, comments, reactions, follows, direct messages, and moderation tools.',
  dependencies: ['core.tenant'],
  phase: 'P3',
  provides: [
    { id: 'social.post.read', description: 'Read social posts and comments' },
    { id: 'social.post.write', description: 'Create posts and comments' },
    { id: 'social.message', description: 'Send and receive direct messages' },
    { id: 'social.moderate', description: 'Moderate posts and comments' },
  ],
  consumes: [],
  routePrefix: '/plugins/social',
  dbSchema: 'plugin_social',
};
