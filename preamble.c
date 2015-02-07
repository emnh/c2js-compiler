#include <string.h>
#include <stdint.h>

// TODO: implement 4 byte / int setters on array and use optimized version
void *memset(void *dest, int c, size_t n)
{
	unsigned char *s = dest;
	for (; n; n--, s++) *s = c;
	return dest;
}

void *fakememset(void *dest, int c, size_t n)
{
	return dest;
}

char *strcpy(char *dest, const char *src)
{
	unsigned char *s = dest;
  int i;
	for (i = 0; src[i] != 0; i++) {
    dest[i] = src[i];
  }
  dest[i] = src[i];
  return dest;
}
