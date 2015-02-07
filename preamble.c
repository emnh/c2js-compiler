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
