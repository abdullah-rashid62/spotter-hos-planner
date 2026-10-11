from django.db import models

class SharedCacheEntry(models.Model):
    """Schema used by Django's DatabaseCache; access entries via django.core.cache."""

    cache_key = models.CharField(max_length=255, primary_key=True)
    value = models.TextField()
    expires = models.DateTimeField(db_index=True)

    class Meta:
        db_table = 'shared_cache'
