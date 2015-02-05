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

int main(int argc, char** argv) {
  return 0;
}
