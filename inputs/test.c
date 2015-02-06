#include <stdio.h>

typedef struct lval_S {
  char a;
  int b;
  char* c;
} lval_T;

void foo(int* a, int *b) {
  if (a[0] > 1) {
    b[0] = 2;
  } else if (a[0] > 1) {
    b[0] = 3;
  }
}

void bar(float x, float y); // just a declaration

void bang(int* a, int v) {
    for (int i = 0; i < v; ++i) {
        i++;
        a[i] -= i;
        *(a + i) -= i;
    }
    int i;
    while (i < 10) {
      i++;
    }
    switch (i) {
      case 0:
        i--;
        break;
      case 1:
      case 2:
        i++;
        break;
      default:
        i++;
        break;
    }
}

void pointers() {
  char* u = "test";
  char** ptr = &u;
  printf("%s", u);
  *ptr = "blah";
  printf("%s", u);

  char* v[2] = { "string1", "string2" };
  char** v2 = v;
  printf("%s", *v2);
  
  int x[2] = { 23, 32 };
  int* x2 = x;
  printf("%d", *x2);
  printf("%d", x2[0]);

  x2++;
  printf("%d", x2[0]);

  char* nul1 = NULL;
  char* nul2 = 0;
  if (nul1 == NULL) {
    puts("nul1 == null");
  }
  if (nul2 == NULL) {
    puts("nul2 == null");
  }
  if (u == NULL) {
    puts("ERROR: u == null");
  }

}

int main(int argc, char** argv) {
  pointers();
  return 0;
}
