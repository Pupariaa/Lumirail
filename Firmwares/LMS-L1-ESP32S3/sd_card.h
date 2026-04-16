#ifndef LMS_L1_SD_CARD_H
#define LMS_L1_SD_CARD_H

#include <stdbool.h>

bool lmsSdMount(void);
bool lmsSdIsMounted(void);
void lmsSdUnmount(void);
bool lmsSdMountedWithFormat(void);

#endif
